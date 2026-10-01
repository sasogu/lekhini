#import <ApplicationServices/ApplicationServices.h>
#import <IOKit/hidsystem/IOHIDLib.h>
#import <napi.h>

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace {
std::atomic<bool> running{false};
std::thread worker;
Napi::ThreadSafeFunction events;
CFMachPortRef tap = nullptr;
CFRunLoopRef runLoop = nullptr;
std::mutex setupMutex;
std::condition_variable setupDone;
bool setupComplete = false;

CGEventRef HandleEvent(CGEventTapProxy, CGEventType type, CGEventRef event, void*) {
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (tap) CGEventTapEnable(tap, true);
    return event;
  }
  if (type != kCGEventKeyDown || !running.load()) return event;

  const auto keyCode = (uint16_t)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  const CGEventFlags flags = CGEventGetFlags(event);
  auto* data = new uint64_t[2]{keyCode, (uint64_t)flags};
  events.NonBlockingCall(data, [](Napi::Env env, Napi::Function callback, uint64_t* value) {
    Napi::Object payload = Napi::Object::New(env);
    payload.Set("keyCode", Napi::Number::New(env, value[0]));
    payload.Set("flags", Napi::Number::New(env, (double)value[1]));
    callback.Call({payload});
    delete[] value;
  });
  return event;
}

void StopWorker() {
  running.store(false);
  if (runLoop) CFRunLoopStop(runLoop);
  if (worker.joinable()) worker.join();
  if (tap) { CFMachPortInvalidate(tap); CFRelease(tap); tap = nullptr; }
  runLoop = nullptr;
  if (events) { events.Release(); events = Napi::ThreadSafeFunction(); }
}

Napi::Value HasPermission(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(),
    IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) == kIOHIDAccessTypeGranted);
}

Napi::Value RequestPermission(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), IOHIDRequestAccess(kIOHIDRequestTypeListenEvent));
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "callback required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) != kIOHIDAccessTypeGranted) {
    return Napi::Boolean::New(env, false);
  }
  StopWorker();
  {
    std::lock_guard<std::mutex> lock(setupMutex);
    setupComplete = false;
  }
  events = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "shortcut-events", 0, 1);
  running.store(true);
  worker = std::thread([] {
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
      kCGEventTapOptionListenOnly, CGEventMaskBit(kCGEventKeyDown), HandleEvent, nullptr);
    if (!tap) {
      running.store(false);
      { std::lock_guard<std::mutex> lock(setupMutex); setupComplete = true; }
      setupDone.notify_one();
      return;
    }
    CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
    runLoop = CFRunLoopGetCurrent();
    CFRetain(runLoop);
    CFRunLoopAddSource(runLoop, source, kCFRunLoopCommonModes);
    CGEventTapEnable(tap, true);
    { std::lock_guard<std::mutex> lock(setupMutex); setupComplete = true; }
    setupDone.notify_one();
    CFRunLoopRun();
    CFRelease(source);
    CFRelease(runLoop);
  });
  {
    std::unique_lock<std::mutex> lock(setupMutex);
    setupDone.wait(lock, [] { return setupComplete; });
  }
  return Napi::Boolean::New(env, running.load());
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  StopWorker();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("hasPermission", Napi::Function::New(env, HasPermission));
  exports.Set("requestPermission", Napi::Function::New(env, RequestPermission));
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}
}

NODE_API_MODULE(shortcut_observer, Init)
