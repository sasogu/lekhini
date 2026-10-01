{
  "targets": [{
    "target_name": "shortcut_observer",
    "sources": [],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "xcode_settings": {
      "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
      "CLANG_ENABLE_OBJC_ARC": "YES",
      "MACOSX_DEPLOYMENT_TARGET": "10.15"
    },
    "conditions": [["OS=='mac'", {
      "sources": ["shortcut_observer.mm"],
      "libraries": ["-framework IOKit"]
    }, {"sources": ["stub.cc"]}]]
  }]
}
