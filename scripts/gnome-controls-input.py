import ctypes,os,sys
assert os.environ.get('LEKHINI_CONTROLS_TEST_DISPLAY')=='isolated', 'Use only from the isolated test runner'
x=ctypes.CDLL('libX11.so.6'); t=ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.argtypes=[ctypes.c_char_p];x.XOpenDisplay.restype=ctypes.c_void_p
x.XFlush.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
t.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
x.XStringToKeysym.argtypes=[ctypes.c_char_p];x.XStringToKeysym.restype=ctypes.c_ulong
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XKeysymToKeycode.restype=ctypes.c_ubyte
d=x.XOpenDisplay(os.environ['DISPLAY'].encode());assert d
if sys.argv[1]=='escape':
 t.XTestFakeKeyEvent(d,9,1,0);t.XTestFakeKeyEvent(d,9,0,0)
elif sys.argv[1]=='key':
 code=x.XKeysymToKeycode(d,x.XStringToKeysym(sys.argv[2].encode()));assert code
 t.XTestFakeKeyEvent(d,code,1,0);t.XTestFakeKeyEvent(d,code,0,0)
elif sys.argv[1]=='move':t.XTestFakeMotionEvent(d,-1,int(sys.argv[2]),int(sys.argv[3]),0)
else:t.XTestFakeButtonEvent(d,1,int(sys.argv[2]=='true'),0)
x.XFlush(d);x.XCloseDisplay(d)
