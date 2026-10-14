#include <linux/input.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <systemd/sd-login.h>
#include <cstdlib>
#include <limits>
#include <algorithm>
#include <array>
#include <cassert>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

// Only physical shortcut labels leave this process. No layout conversion,
// characters, recordings, exclusive grabs, network or user-supplied paths.
static const std::map<unsigned, std::string> names = {
  {KEY_ESC,"Esc"},{KEY_TAB,"Tab"},{KEY_ENTER,"Enter"},{KEY_KPENTER,"Enter"},
  {KEY_BACKSPACE,"Backspace"},{KEY_DELETE,"Delete"},{KEY_HOME,"Home"},
  {KEY_END,"End"},{KEY_PAGEUP,"Page Up"},{KEY_PAGEDOWN,"Page Down"},
  {KEY_LEFT,"Left"},{KEY_RIGHT,"Right"},{KEY_UP,"Up"},{KEY_DOWN,"Down"},
  {KEY_F1,"F1"},{KEY_F2,"F2"},{KEY_F3,"F3"},{KEY_F4,"F4"},{KEY_F5,"F5"},
  {KEY_F6,"F6"},{KEY_F7,"F7"},{KEY_F8,"F8"},{KEY_F9,"F9"},{KEY_F10,"F10"},
  {KEY_F11,"F11"},{KEY_F12,"F12"},{KEY_SPACE,"Space"},
  {KEY_A,"A"},{KEY_B,"B"},{KEY_C,"C"},{KEY_D,"D"},{KEY_E,"E"},{KEY_F,"F"},
  {KEY_G,"G"},{KEY_H,"H"},{KEY_I,"I"},{KEY_J,"J"},{KEY_K,"K"},{KEY_L,"L"},
  {KEY_M,"M"},{KEY_N,"N"},{KEY_O,"O"},{KEY_P,"P"},{KEY_Q,"Q"},{KEY_R,"R"},
  {KEY_S,"S"},{KEY_T,"T"},{KEY_U,"U"},{KEY_V,"V"},{KEY_W,"W"},{KEY_X,"X"},
  {KEY_Y,"Y"},{KEY_Z,"Z"},{KEY_1,"1"},{KEY_2,"2"},{KEY_3,"3"},{KEY_4,"4"},
  {KEY_5,"5"},{KEY_6,"6"},{KEY_7,"7"},{KEY_8,"8"},{KEY_9,"9"},{KEY_0,"0"},
  {KEY_MINUS,"-"},{KEY_EQUAL,"="},{KEY_LEFTBRACE,"["},{KEY_RIGHTBRACE,"]"},
};

static std::string label(unsigned code, const std::set<unsigned>& held) {
  auto key = names.find(code);
  if (key == names.end()) return {};
  bool ctrl = held.count(KEY_LEFTCTRL) || held.count(KEY_RIGHTCTRL);
  bool alt = held.count(KEY_LEFTALT);
  bool super = held.count(KEY_LEFTMETA) || held.count(KEY_RIGHTMETA);
  bool shift = held.count(KEY_LEFTSHIFT) || held.count(KEY_RIGHTSHIFT);
  // AltGr and Shift-only typing must never reveal ordinary input.
  if (held.count(KEY_RIGHTALT)) return {};
  bool special = code == KEY_ESC || code == KEY_TAB || code == KEY_ENTER ||
    code == KEY_KPENTER || code == KEY_BACKSPACE || code == KEY_DELETE ||
    (code >= KEY_F1 && code <= KEY_F10) || code == KEY_F11 || code == KEY_F12 ||
    code == KEY_HOME || code == KEY_END || code == KEY_PAGEUP || code == KEY_PAGEDOWN ||
    code == KEY_LEFT || code == KEY_RIGHT || code == KEY_UP || code == KEY_DOWN;
  if (!ctrl && !alt && !super && !special) return {};
  std::string result;
  if (ctrl) result += "Ctrl+";
  if (alt) result += "Alt+";
  if (super) result += "Super+";
  if (shift) result += "Shift+";
  return result + key->second;
}

struct Device {
  int fd;
  std::string path;
  ino_t inode;
  std::set<unsigned> held;
  bool recovering = false;
};
static bool bit(const std::array<unsigned char, (KEY_MAX+8)/8>& bits, unsigned code) {
  return bits[code/8] & (1u << (code%8));
}
static void snapshot(Device& device) {
  std::array<unsigned char, (KEY_MAX+8)/8> bits{};
  device.held.clear();
  if (ioctl(device.fd, EVIOCGKEY(bits.size()), bits.data()) < 0) return;
  for (unsigned code=0; code<=KEY_MAX; ++code) if (bit(bits, code)) device.held.insert(code);
}
static void closeDevices(std::vector<Device>& devices) {
  for (auto& device: devices) close(device.fd);
  devices.clear();
}
static bool callerIsActive() {
  const char* caller = std::getenv("PKEXEC_UID");
  if (!caller || !*caller) return false;
  char* end = nullptr;
  unsigned long parsed = std::strtoul(caller, &end, 10);
  if (*end || parsed > std::numeric_limits<uid_t>::max()) return false;
  uid_t activeUid;
  char* session = nullptr;
  char* type = nullptr;
  bool active = sd_seat_get_active("seat0", &session, &activeUid) >= 0 &&
    activeUid == parsed && sd_session_get_type(session, &type) >= 0 &&
    std::string(type) == "wayland";
  std::free(type);
  std::free(session);
  return active;
}
static void scan(std::vector<Device>& devices, bool initializeState = true) {
  std::error_code error;
  for (const auto& entry: std::filesystem::directory_iterator("/dev/input", error)) {
    if (entry.path().filename().string().rfind("event",0) != 0) continue;
    struct stat info{};
    if (stat(entry.path().c_str(), &info) || !S_ISCHR(info.st_mode)) continue;
    auto existing = std::find_if(devices.begin(), devices.end(), [&](const Device& d) {
      return d.path == entry.path().string() && d.inode == info.st_ino;
    });
    if (existing != devices.end()) continue;
    int fd = open(entry.path().c_str(), O_RDONLY|O_NONBLOCK|O_CLOEXEC);
    if (fd < 0) continue;
    std::array<unsigned char, (KEY_MAX+8)/8> capabilities{};
    if (ioctl(fd, EVIOCGBIT(EV_KEY, capabilities.size()), capabilities.data()) < 0 ||
        !bit(capabilities, KEY_A) || !bit(capabilities, KEY_Z)) { close(fd); continue; }
    Device device{fd, entry.path().string(), info.st_ino, {}};
    if (initializeState) snapshot(device);
    devices.push_back(std::move(device));
  }
}
static void selfTest() {
  assert(label(KEY_C,{KEY_LEFTCTRL}) == "Ctrl+C");
  assert(label(KEY_V,{KEY_RIGHTCTRL,KEY_LEFTSHIFT}) == "Ctrl+Shift+V");
  assert(label(KEY_TAB,{KEY_LEFTALT}) == "Alt+Tab");
  assert(label(KEY_F5,{}) == "F5");
  assert(label(KEY_A,{}).empty());
  assert(label(KEY_A,{KEY_LEFTSHIFT}).empty());
  assert(label(KEY_Q,{KEY_LEFTCTRL,KEY_RIGHTALT}).empty());
  assert(label(KEY_LEFTCTRL,{KEY_LEFTCTRL}).empty());
  assert(label(KEY_SPACE,{}).empty());
  assert(label(KEY_SPACE,{KEY_LEFTCTRL}) == "Ctrl+Space");
  std::cout << "Shortcut filtering and modifier labels: PASS\n";
}
int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--self-test") { selfTest(); return 0; }
  if (argc > 2 || (argc == 2 && std::string(argv[1]) != "--probe")) return 1;
  if (geteuid() != 0) return 1;
  std::vector<Device> devices;
  if (argc == 2) {
    scan(devices, false);
    std::cout << "Keyboards available: " << devices.size() << '\n';
    bool found = !devices.empty();
    closeDevices(devices);
    return found ? 0 : 1;
  }
  bool active = false;
  std::string commands;
  auto nextScan = std::chrono::steady_clock::now();
  std::cout << "READY 1\n" << std::flush;
  while (true) {
    bool allowed = active && callerIsActive();
    if (!allowed) closeDevices(devices);
    if (allowed && std::chrono::steady_clock::now() >= nextScan) {
      scan(devices);
      nextScan = std::chrono::steady_clock::now() + std::chrono::milliseconds(500);
    }
    std::vector<pollfd> fds{{STDIN_FILENO, POLLIN, 0}};
    for (auto& d: devices) fds.push_back({d.fd, POLLIN, 0});
    if (poll(fds.data(), fds.size(), active ? 200 : -1) < 0) break;
    if (fds[0].revents & (POLLHUP|POLLERR|POLLNVAL)) break;
    if (fds[0].revents & POLLIN) {
      char input[128];
      ssize_t size = read(STDIN_FILENO, input, sizeof(input));
      if (size <= 0) break;
      commands.append(input, size);
      if (commands.size() > 256) break;
      size_t end;
      while ((end=commands.find('\n')) != std::string::npos) {
        auto command = commands.substr(0,end);
        commands.erase(0,end+1);
        if (command == "PAUSE") { active=false; closeDevices(devices); }
        else if (command == "RESUME") { active=true; nextScan=std::chrono::steady_clock::now(); }
        else { closeDevices(devices); return 1; }
      }
      continue; // device list may have changed
    }
    if (!callerIsActive()) { closeDevices(devices); continue; }
    for (size_t i=devices.size(); i>0; --i) {
      auto& d = devices[i-1];
      if (fds[i].revents & (POLLHUP|POLLERR|POLLNVAL)) {
        close(d.fd); devices.erase(devices.begin()+i-1); continue;
      }
      if (!(fds[i].revents & POLLIN)) continue;
      input_event event{};
      while (read(d.fd, &event, sizeof(event)) == sizeof(event)) {
        if (event.type == EV_SYN && event.code == SYN_DROPPED) { d.recovering=true; continue; }
        if (d.recovering) {
          if (event.type == EV_SYN && event.code == SYN_REPORT) { snapshot(d); d.recovering=false; }
          continue;
        }
        if (event.type != EV_KEY || event.value == 2) continue;
        if (event.value == 0) { d.held.erase(event.code); continue; }
        if (d.held.count(event.code)) continue;
        d.held.insert(event.code);
        std::set<unsigned> held;
        for (const auto& keyboard: devices) held.insert(keyboard.held.begin(),keyboard.held.end());
        auto text = label(event.code,held);
        if (!text.empty()) std::cout << "KEY\t" << text << '\n' << std::flush;
      }
    }
  }
  closeDevices(devices);
  return 0;
}
