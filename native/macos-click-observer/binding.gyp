{
  "targets": [{
    "target_name": "click_observer",
    "sources": [],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "libraries": ["-framework IOKit"],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      "CLANG_ENABLE_OBJC_ARC": "YES",
      "MACOSX_DEPLOYMENT_TARGET": "10.15"
    },
    "conditions": [["OS=='mac'", {"sources": ["click_observer.mm"]}, {"sources": ["stub.cc"]}]]
  }]
}
