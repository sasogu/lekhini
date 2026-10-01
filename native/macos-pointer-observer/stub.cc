#include <napi.h>
namespace {
Napi::Value False(const Napi::CallbackInfo& info) { return Napi::Boolean::New(info.Env(), false); }
Napi::Value Stop(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("hasPermission", Napi::Function::New(env, False));
  exports.Set("start", Napi::Function::New(env, False));
  exports.Set("stop", Napi::Function::New(env, Stop));
  return exports;
}
}
NODE_API_MODULE(pointer_observer, Init)
