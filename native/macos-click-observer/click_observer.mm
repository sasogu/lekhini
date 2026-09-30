#import <ApplicationServices/ApplicationServices.h>
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
  int button = -1;
  if (type == kCGEventLeftMouseDown) button = 0;
  if (type == kCGEventRightMouseDown) button = 1;
  if (type == kCGEventOtherMouseDown) {
    const int nativeButton = (int)CGEventGetIntegerValueField(event, kCGMouseEventButtonNumber);
    if (nativeButton == 2) button = 2;
  }
  if (button >= 0 && running.load()) {
    CGPoint point = CGEventGetLocation(event);
    auto* data = new double[3]{(double)button, point.x, point.y};
    events.NonBlockingCall(data, [](Napi::Env env, Napi::Function callback, double* value) {
      Napi::Object payload = Napi::Object::New(env);
      payload.Set("button", Napi::Number::New(env, value[0]));
      payload.Set("x", Napi::Number::New(env, value[1]));
      payload.Set("y", Napi::Number::New(env, value[2]));
      callback.Call({payload});
      delete[] value;
    });
  }
  // Listen-only tap, and always return the untouched event to the OS.
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
  return Napi::Boolean::New(info.Env(), CGPreflightListenEventAccess());
}

Napi::Value RequestPermission(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), CGRequestListenEventAccess());
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "callback required").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (!CGPreflightListenEventAccess()) return Napi::Boolean::New(env, false);
  StopWorker();
  {
    std::lock_guard<std::mutex> lock(setupMutex);
    setupComplete = false;
  }
  events = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "click-events", 0, 1);
  running.store(true);
  worker = std::thread([] {
    const CGEventMask mask = CGEventMaskBit(kCGEventLeftMouseDown) |
      CGEventMaskBit(kCGEventRightMouseDown) | CGEventMaskBit(kCGEventOtherMouseDown);
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
      kCGEventTapOptionListenOnly, mask, HandleEvent, nullptr);
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
} // namespace

NODE_API_MODULE(click_observer, Init)
