#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <HardwareSerial.h>

// ====== USER SETTINGS ======
const char* WIFI_SSID = "JRD100";
const char* WIFI_PASS = "mpmp1370";
const uint16_t UDP_PORT = 33940;          // command + event port
const char* MDNS_NAME = "esp32-jrd-com7";      // esp32-jrd-com7.local

// ====== JRD-100 UART PINS / BAUD ======
HardwareSerial RFID(2);                   // UART2
const int PIN_RX2 = 16;                   // JRD TXD -> ESP32 RX2
const int PIN_TX2 = 17;                   // JRD RXD -> ESP32 TX2
const uint32_t JRD_BAUD = 115200;

// ====== UDP ======
WiFiUDP udp;
IPAddress lastClientIP;
uint16_t lastClientPort = 0;

// ---------- Helpers ----------
static inline uint8_t csum8(const uint8_t* p, size_t n) {
  uint32_t s = 0; for (size_t i=0;i<n;i++) s += p[i]; return (uint8_t)(s & 0xFF);
}

String toHex(const uint8_t* data, size_t len) {
  static const char* HX = "0123456789ABCDEF";
  String out; out.reserve(len*3);
  for (size_t i=0;i<len;i++) {
    out += HX[(data[i]>>4)&0xF];
    out += HX[data[i]&0xF];
    if (i+1<len) out += ' ';
  }
  return out;
}

// Send a JRD command and try to read 1 (or more) response/notification frames for up to wait_ms.
// Returns number of bytes collected in buf.
size_t jrdCommand(const uint8_t* cmd, size_t cmdLen, uint8_t* buf, size_t buflen, uint32_t wait_ms=300) {
  while (RFID.available()) (void)RFID.read();       // flush input
  RFID.write(cmd, cmdLen); RFID.flush();
  size_t n = 0; unsigned long t0 = millis();

  // collect all available bytes while time remains
  while (millis() - t0 < wait_ms) {
    while (RFID.available() && n < buflen) {
      buf[n++] = (uint8_t)RFID.read();
    }
    delay(2);
  }
  return n;
}

// Convenience: send a single JRD command (Type..End built for you)
void buildFrameAndSend(uint8_t cmd, const uint8_t* params, uint16_t plen) {
  uint8_t header[5] = {0xBB, 0x00, cmd, (uint8_t)(plen >> 8), (uint8_t)(plen & 0xFF)};
  uint8_t sum = csum8(&header[1], 1+1+2); // Type..PL(LSB)
  if (plen && params) {
    sum = sum + csum8(params, plen);
  }
  RFID.write(header, sizeof(header));
  if (plen && params) RFID.write(params, plen);
  RFID.write(sum);
  RFID.write(0x7E);
  RFID.flush();
}

// Parse GetPower response: expects "... 01 B7 00 02 PowMSB PowLSB CS 7E"
bool parseGetPower(const uint8_t* b, size_t n, float& dBmOut) {
  for (size_t i=0; i+8<=n; ++i) {
    if (b[i]==0xBB && b[i+1]==0x01 && b[i+2]==0xB7 && b[i+3]==0x00 && b[i+4]==0x02) {
      uint16_t centi = ((uint16_t)b[i+5]<<8) | b[i+6];
      dBmOut = centi / 100.0f; // datasheet: 0x07D0 -> 2000 -> 20.00 dBm
      return true;
    }
  }
  return false;
}

// Parse SetPower OK: "... 01 B6 00 01 00 ..."
bool parseSimpleOK(uint8_t cmd, const uint8_t* b, size_t n) {
  for (size_t i=0; i+7<=n; ++i) {
    if (b[i]==0xBB && b[i+1]==0x01 && b[i+2]==cmd && b[i+3]==0x00 && b[i+4]==0x01 && b[i+5]==0x00) return true;
  }
  return false;
}

// Parse Module Info reply (Type=0x01, Cmd=0x03). Returns ASCII after first info-type byte.
bool parseInfo(const uint8_t* b, size_t n, String& out) {
  for (size_t i=0; i+7<=n; ++i) {
    if (b[i]==0xBB && b[i+1]==0x01 && b[i+2]==0x03) {
      uint16_t PL = ((uint16_t)b[i+3]<<8) | b[i+4];
      size_t start = i+5; // InfoType at start
      if (start + PL <= n) {
        if (PL>=1) {
          out.reserve(PL-1);
          for (size_t k=start+1; k<start+PL; ++k) out += (char)b[k];
          return true;
        }
      }
    }
  }
  return false;
}

// When scanning continuously, forward all notification frames as “event_hex …”
void forwardRawIfAny() {
  static uint8_t rx[600];
  size_t n = 0;
  while (RFID.available() && n < sizeof(rx)) rx[n++] = (uint8_t)RFID.read();
  if (n==0) return;
  if (lastClientPort) {
    String line = "event_hex " + toHex(rx, n);
    udp.beginPacket(lastClientIP, lastClientPort);
    udp.print(line);
    udp.endPacket();
  }
}

// ---------- Arduino setup/loop ----------
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== ESP32 + JRD-100 UDP bridge ===");

  // UART2
  RFID.begin(JRD_BAUD, SERIAL_8N1, PIN_RX2, PIN_TX2);
  delay(50);
  Serial.println("UART2 ready at 115200 (RX2=GPIO16, TX2=GPIO17)");

  // Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) { Serial.print("."); delay(500); }
  Serial.printf("\nWiFi OK: %s / IP=%s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());

  // mDNS
  if (MDNS.begin(MDNS_NAME)) {
    MDNS.addService("jrd", "udp", UDP_PORT);
    Serial.printf("mDNS: %s.local (service _jrd._udp)\n", MDNS_NAME);
  } else {
    Serial.println("mDNS failed (continuing without)");
  }

  // UDP
  udp.begin(UDP_PORT);
  Serial.printf("UDP listening on %u\n", UDP_PORT);
}

void loop() {
  // 1) Handle UDP commands
  int pkLen = udp.parsePacket();
  if (pkLen > 0) {
    String msg; msg.reserve(pkLen+1);
    while (udp.available()) msg += (char)udp.read();
    msg.trim();

    lastClientIP = udp.remoteIP();
    lastClientPort = udp.remotePort();

    Serial.printf("UDP from %s:%u -> %s\n",
        lastClientIP.toString().c_str(), lastClientPort, msg.c_str());

    if (msg == "ping") {
      udp.beginPacket(lastClientIP, lastClientPort);
      udp.print("pong");
      udp.endPacket();
    }
    else if (msg == "get_power") {
      // Frame: BB 00 B7 00 00 B7 7E
      const uint8_t cmd[] = {0xBB,0x00,0xB7,0x00,0x00,0xB7,0x7E};
      uint8_t buf[128];
      size_t n = jrdCommand(cmd, sizeof(cmd), buf, sizeof(buf), 300);
      float dBm;
      if (parseGetPower(buf, n, dBm)) {
        udp.beginPacket(lastClientIP, lastClientPort);
        udp.printf("power_dbm %.2f\n", dBm);
        udp.endPacket();
      } else {
        udp.beginPacket(lastClientIP, lastClientPort);
        udp.print("error no_power_reply hex ");
        udp.print(toHex(buf, n));
        udp.endPacket();
      }
    }
    else if (msg.startsWith("set_power=")) {
      int val = msg.substring(String("set_power=").length()).toInt(); // dBm
      if (val < 0 || val > 60) { // sanity
        udp.beginPacket(lastClientIP, lastClientPort);
        udp.print("error bad_value");
        udp.endPacket();
      } else {
        uint16_t centi = (uint16_t)(val * 100);
        uint8_t params[2] = { (uint8_t)(centi>>8), (uint8_t)(centi&0xFF) };
        buildFrameAndSend(0xB6, params, 2);
        uint8_t buf[64];
        delay(100);
        size_t n = 0; while (RFID.available() && n<sizeof(buf)) buf[n++] = (uint8_t)RFID.read();
        bool ok = parseSimpleOK(0xB6, buf, n);
        udp.beginPacket(lastClientIP, lastClientPort);
        if (ok) udp.print("ok");
        else { udp.print("error not_ack hex "); udp.print(toHex(buf, n)); }
        udp.endPacket();
      }
    }
    else if (msg.startsWith("info=")) {
      uint8_t which = 0x00; // hw
      if (msg.endsWith("sw")) which = 0x01;
      else if (msg.endsWith("mfg")) which = 0x02;

      uint8_t params[1] = { which };
      buildFrameAndSend(0x03, params, 1);
      uint8_t buf[256];
      size_t n = jrdCommand(nullptr, 0, buf, sizeof(buf), 300);
      String info;
      udp.beginPacket(lastClientIP, lastClientPort);
      if (parseInfo(buf, n, info)) {
        udp.print("info ");
        udp.print(info);
      } else {
        udp.print("error no_info hex ");
        udp.print(toHex(buf, n));
      }
      udp.endPacket();
    }
    else if (msg == "start_scan") {
      // Multi-inventory (0x27). Reserved=0x22, Count=0xFFFF (long run)
      uint8_t params[3] = {0x22, 0xFF, 0xFF};
      buildFrameAndSend(0x27, params, 3);
      // no immediate ACK expected here; tags will arrive as notification frames (0x02).
      udp.beginPacket(lastClientIP, lastClientPort);
      udp.print("scan_started");
      udp.endPacket();
    }
    else if (msg == "stop_scan") {
      // Stop (0x28)
      buildFrameAndSend(0x28, nullptr, 0);
      uint8_t buf[64];
      size_t n = jrdCommand(nullptr, 0, buf, sizeof(buf), 200);
      bool ok = parseSimpleOK(0x28, buf, n);
      udp.beginPacket(lastClientIP, lastClientPort);
      if (ok) udp.print("scan_stopped");
      else { udp.print("warn maybe_stopped hex "); udp.print(toHex(buf, n)); }
      udp.endPacket();
    }
    else {
      udp.beginPacket(lastClientIP, lastClientPort);
      udp.print("error unknown_cmd");
      udp.endPacket();
    }
  }

  // 2) While scanning, forward any incoming bytes as events
  forwardRawIfAny();
}
