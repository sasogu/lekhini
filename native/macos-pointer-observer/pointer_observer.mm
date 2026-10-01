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
  if (!running.load()) return event;
  const CGPoint point = CGEventGetLocation(event);
  auto* value = new double[2]{point.x, point.y};
  const napi_status status = events.NonBlockingCall(value,
    [](Napi::Env env, Napi::Function callback, double* position) {
      Napi::Object payload = Napi::Object::New(env);
      payload.Set("x", Napi::Number::New(env, position[0]));
      payload.Set("y", Napi::Number::New(env, position[1]));
      callback.Call({payload});
      delete[] position;
    });
  if (status != napi_ok) delete[] value;
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

Napi::Value Start(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) return Napi::Boolean::New(env, false);
  StopWorker();
  { std::lock_guard<std::mutex> lock(setupMutex); setupComplete = false; }
  events = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "pointer-events", 1, 1);
  running.store(true);
  worker = std::thread([] {
    const CGEventMask mask = CGEventMaskBit(kCGEventMouseMoved) |
      CGEventMaskBit(kCGEventLeftMouseDragged) | CGEventMaskBit(kCGEventRightMouseDragged) |
      CGEventMaskBit(kCGEventOtherMouseDragged);
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
  { std::unique_lock<std::mutex> lock(setupMutex); setupDone.wait(lock, [] { return setupComplete; }); }
  return Napi::Boolean::New(env, running.load());
}

Napi::Value Stop(const Napi::CallbackInfo& info) { StopWorker(); return info.Env().Undefined(); }
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("hasPermission", Napi::Function::New(env, HasPermission));
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}
}
NODE_API_MODULE(pointer_observer, Init)
