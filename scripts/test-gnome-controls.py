"""Run with dbus-run-session -- python3 scripts/test-gnome-controls.py.
Requires GNOME Shell 48, Xvfb, xwininfo, and libXtst. All windows and injected
clicks belong to a temporary X server and profile, never the real desktop.
"""
from pathlib import Path
import subprocess,tempfile,os,time,select,sys
project=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='lekhini-controls-x11-') as tmp:
 root=Path(tmp); runtime=root/'runtime';runtime.mkdir(mode=0o700)
 E={**os.environ,'XDG_RUNTIME_DIR':str(runtime),'XDG_CONFIG_HOME':str(root/'config'),'XDG_DATA_HOME':str(root/'data'),'XDG_CACHE_HOME':str(root/'cache'),'GSETTINGS_BACKEND':'memory','XDG_SESSION_TYPE':'x11','LIBGL_ALWAYS_SOFTWARE':'1'}
 pictures=root/'Imatges de prova';pictures.mkdir()
 config=root/'config';config.mkdir()
 (config/'user-dirs.dirs').write_text('XDG_PICTURES_DIR="'+str(pictures)+'"\n')
 E['LEKHINI_TEST_PICTURES_DIR']=str(pictures)
 E['LEKHINI_CONTROLS_TEST_DISPLAY']='isolated'
 E.pop('WAYLAND_DISPLAY',None);E.pop('XAUTHORITY',None)
 rd,wr=os.pipe();server=subprocess.Popen(['Xvfb','-displayfd',str(wr),'-screen','0','1920x1080x24','-nolisten','tcp'],pass_fds=[wr],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);os.close(wr)
 shell=app=None
 try:
  assert select.select([rd],[],[],10)[0];E['DISPLAY']=':'+os.read(rd,100).decode().strip();os.close(rd)
  with open(str(root/'shell.log'),'w') as log:
   shell=subprocess.Popen(['gnome-shell','--x11','--sm-disable','--display='+E['DISPLAY']],env=E,stdout=log,stderr=log);time.sleep(4);assert shell.poll() is None
   app=subprocess.Popen([str(project/'node_modules/electron/dist/electron'),str(project),'--ozone-platform=x11','--disable-gpu','--remote-debugging-address=127.0.0.1','--remote-debugging-port=19327'],env=E,stdout=log,stderr=log)
   result=subprocess.run(['node',str(project/'native/gnome-pointer'/('test-capture.mjs' if '--capture' in sys.argv else 'test-controls.mjs'))],env=E,text=True,capture_output=True,timeout=45);print(result.stdout);print(result.stderr);assert result.returncode==0
 finally:
  for process in [app,shell,server]:
   if process and process.poll() is None:
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait()
