#include <HardwareSerial.h>
#include <WiFi.h>
#include <WebSocketsClient.h>

HardwareSerial RFID(2);

#define JRD_RX 17  // ESP32 RX  ← JRD TX
#define JRD_TX 16  // ESP32 TX  → JRD RX
#define JRD_EN 4   // Enable pin

#define START_BYTE 0xBB
#define END_BYTE 0x7E

unsigned long lastHbMs = 0;
unsigned long lastRssiMs = 0;
unsigned long lastBattMs = 0;

bool scanAnnounced = false;

String serialBuf = "";

uint8_t frameBuf[256];
uint16_t framePos = 0;

enum FrameState {
  WAIT_FOR_START,
  IN_FRAME
};

FrameState state = WAIT_FOR_START;

const char* ssid = "HiWEB1";
const char* password = "30681422";

const char* host = "192.168.1.104";
const uint16_t port = 1253;

uint8_t hb = 0x0C;  // MODULE_ID & Heartbeat
uint8_t helloMsg[2] = { 0xFF, hb };

WebSocketsClient ws;

/////////////////////////// Reading //////////////////////////////////////
void readRxUART() {
  while (RFID.available()) {
    uint8_t b = RFID.read();

    switch (state) {

      case WAIT_FOR_START:
        if (b == START_BYTE) {
          framePos = 0;
          frameBuf[framePos++] = b;
          state = IN_FRAME;
        }
        break;

      case IN_FRAME:
        frameBuf[framePos++] = b;

        // جلوگیری از overflow اگر فریم خراب باشد
        if (framePos >= sizeof(frameBuf)) {
          state = WAIT_FOR_START;
          framePos = 0;
          return;
        }

        if (b == END_BYTE) {
          processFrame(frameBuf, framePos);
          state = WAIT_FOR_START;
          framePos = 0;
        }
        break;
    }
  }
}
void processFrame(const uint8_t* frame, int len) {
  if (len >= 7) {
    uint8_t type = frame[1];
    uint8_t cmd = frame[2];

    if (type == 0x02) {
      Serial.println("NOTIFY: EPC/RSSI frame received.");
      if (ws.isConnected()) {
        ws.sendBIN(frame, len);
      }
      return;
    }

    if (type == 0x01) {
      if (cmd == 0x27) {
        Serial.println("Scanning started");
      }
      if (cmd != 0xFF) {
        Serial.printf("RESPONSE OK for command 0x%02X\n", cmd);
        if (ws.isConnected()) {
          ws.sendBIN(frame, len);
        }
        return;
      }
    }
  }
}
void readRxUARTTask(void* param) {
  while (true) {
    readRxUART();
    vTaskDelay(1);  // prevents starving CPU
  }
}
//////////////////////////////////////////////////////////////////////////


/////////////////////////// Serial Handler ///////////////////////////////
// void serialInputStringHandler() {
//   while (Serial.available()) {
//     char c = Serial.read();

//     // پایان دستور: Enter یا Space یا ;
//     if (c == '\n' || c == '\r' || c == ' ' || c == ';') {
//       if (serialBuf.length() > 0) {
//         serialCommandHandle(serialBuf);
//         serialBuf = "";
//       }
//       continue;
//     }

//     serialBuf += c;
//   }
// }
// void serialCommandHandle(String cmd) {
//   cmd.toLowerCase();

//   if (cmd == "s") {
//     startContinuous();
//     return;
//   }
//   if (cmd == "t") {
//     stopContinuous();
//     return;
//   }
//   if (cmd == "g") {
//     getPower();
//     return;
//   }
//   if (cmd.startsWith("p")) {
//     int p = cmd.substring(1).toInt();
//     if (p > 0) {
//       setPower((uint8_t)p);
//     }
//     return;
//   }
//   if (cmd.startsWith("r")) {
//     int reg = strtol(cmd.substring(1).c_str(), NULL, 16);
//     setRegion((uint8_t)reg);
//     Serial.printf("Setting region: 0x%02X\n", reg);
//     return;
//   }
//   if (cmd == "h") getModuleInfo(0x00);  // HW version
//   if (cmd == "v") getModuleInfo(0x01);  // SW version
//   if (cmd == "m") getModuleInfo(0x02);  // Manufacturer
// }
// void serialInputStringHandlerTask(void* param) {
//   while (true) {
//     serialInputStringHandler();
//     vTaskDelay(25 / portTICK_PERIOD_MS);
//   }
// }
//////////////////////////////////////////////////////////////////////////


/////////////////////////// Commands //////////////////////////////////////
uint8_t calcChecksum(const uint8_t* data, int len) {
  uint16_t sum = 0;
  for (int i = 0; i < len; i++) {
    sum += data[i];
  }
  return (uint8_t)(sum & 0xFF);
}
bool sendCommand(const uint8_t* cmd, size_t len, const char* desc = "") {
  if (!RFID.availableForWrite()) {
    Serial.printf("err: UART buffer full! %s ignored.\n", desc);
    return false;
  }
  RFID.write(cmd, len);
  Serial.printf("CMD send: %s\n", desc);
  return true;
}
void startContinuous() {
  // ===== Multiple Inventory Command (0x27) =====
  const uint8_t MULTI_INV[] = {
    0xBB,  // Header
    0x00,  // Type
    0x27,  // Command
    0x00,  // PL(MSB)
    0x03,  // PL(LSB)
    0x22,  // Param1 => Reserved
    0xFF,  // Param2 => CNT(MSB)
    0xFF,  // Param3 => CNT(LSB)
    0x4A,  // CHS
    0x7E   // END
  };
  sendCommand(MULTI_INV, sizeof(MULTI_INV), "MULTI_INV");
  if (ws.isConnected()) {
    uint8_t ack[] = { 0xBB, 0x01, 0x27, 0x00, 0x01, 0x00, 0x29, 0x7E };
    ws.sendBIN(ack, sizeof(ack));
  }
}
void stopContinuous() {
  const uint8_t STOP_MULTI_INV[] = {
    0xBB,  // Header
    0x00,  // Type
    0x28,  // Command
    0x00,  // PL(MSB)
    0x00,  // PL(LSB)
    0x28,  // CHS
    0x7E   // END
  };
  sendCommand(STOP_MULTI_INV, sizeof(STOP_MULTI_INV), "STOP_MULTI_INV");
  scanAnnounced = false;
}
void getPower() {
  uint8_t cmd[] = {
    0xBB,
    0x00,
    0xB7,
    0x00,
    0x00,
    0xB7,  // checksum
    0x7E
  };

  sendCommand(cmd, sizeof(cmd), "GET_POWER");
}
void setPower(float dbm) {
  // محدوده معمول JRD100 بین 18 تا 26 dBm است
  if (dbm < 0.0f) dbm = 0.0f;
  if (dbm > 30.0f) dbm = 30.0f;  // یه سقف منطقی

  uint16_t powVal = (uint16_t)(dbm * 100.0f + 0.5f);  // رند کردن
  uint8_t powMsb = (powVal >> 8) & 0xFF;
  uint8_t powLsb = powVal & 0xFF;

  uint8_t frame[] = {
    0xBB,  // Header
    0x00,  // Type
    0xB6,  // Command: Set power
    0x00,  // PL(MSB)
    0x02,  // PL(LSB) = 2 bytes
    powMsb,
    powLsb,
    0x00,  // Checksum placeholder
    0x7E
  };

  // checksum از Type تا آخرین پارامتر (index 1..6 → 6 بایت)
  frame[7] = calcChecksum(&frame[1], 6);

  sendCommand(frame, sizeof(frame), "SET_POWER");
}
void setRegion(uint8_t region) {
  // 0x01 = China 900MHz
  // 0x04 = China 800MHz
  // 0x02 = US
  // 0x03 = Europe
  // 0x06 = Korea
  uint8_t cmd[] = {
    0xBB,
    0x00,
    0x07,
    0x00,
    0x01,
    region,
    0x00,  // checksum placeholder
    0x7E
  };

  cmd[6] = calcChecksum(&cmd[1], 5);

  sendCommand(cmd, sizeof(cmd), "SET_REGION");
}
void getModuleInfo(uint8_t infoType) {

  // infoType:
  //   0x00 = Hardware version
  //   0x01 = Software version
  //   0x02 = Manufacturer

  uint8_t frame[] = {
    0xBB,  // Header
    0x00,  // Type: command
    0x03,  // Command: Get module info
    0x00,  // PL(MSB)
    0x01,  // PL(LSB) = 1 byte parameter
    infoType,
    0x00,  // Checksum (placeholder)
    0x7E   // End
  };

  // checksum از Type تا آخرین پارامتر
  frame[6] = calcChecksum(&frame[1], 5);

  sendCommand(frame, sizeof(frame), "GET_MODULE_INFO");
}
//////////////////////////////////////////////////////////////////////////


/////////////////////////// Socket ///////////////////////////////////////
/*void heartbeatTask(void* param) {
  for (;;) {
    if (ws.isConnected()) {
      ws.sendBIN(&hb, 1);  // send 1-byte heartbeat
    }
    vTaskDelay(3000 / portTICK_PERIOD_MS);  // every 3 seconds
  }
}*/
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to: %s\n", payload);
      // send initial hello / register
      {
        ws.sendBIN(helloMsg, 2);
      }
      break;

    case WStype_BIN:
      handleBinaryCommand(payload, length);
      break;

    case WStype_ERROR:
      Serial.println("[WS] ERROR");
      break;

    default:
      break;
  }
}
void handleBinaryCommand(uint8_t* data, size_t len) {
  if (len == 0) return;

  uint8_t cmd = data[0];

  switch (cmd) {
    // -------------------------------------------------
    // START SCAN (0xA1)
    // -------------------------------------------------
    case 0xA1:
      Serial.println("[CMD] Start continuous scan");
      startContinuous();
      break;

    // -------------------------------------------------
    // STOP SCAN (0xA2)
    // -------------------------------------------------
    case 0xA2:
      Serial.println("[CMD] Stop continuous scan");
      stopContinuous();
      break;

    // -------------------------------------------------
    // GET POWER (0xB1)
    // -------------------------------------------------
    case 0xB1:
      Serial.println("[CMD] Get current power");
      getPower();
      break;

    // -------------------------------------------------
    // SET POWER (0xB2 <power>)
    // -------------------------------------------------
    case 0xB2:
      if (len < 2) {
        Serial.println("[CMD] ERROR: Missing power value");
        return;
      }
      Serial.printf("[CMD] Set power: %d dBm\n", data[1]);
      setPower((uint8_t)data[1]);
      break;

    // -------------------------------------------------
    // SET REGION (0xC2 <region>)
    // -------------------------------------------------
    case 0xC1:
      if (len < 2) {
        Serial.println("[CMD] ERROR: Missing region value");
        return;
      }
      Serial.printf("[CMD] Set region: 0x%02X\n", data[1]);
      setRegion(data[1]);
      break;

    // -------------------------------------------------
    // GET HARDWARE VERSION (0xD1)
    // -------------------------------------------------
    case 0xD1:
      if (len < 2) {
        Serial.println("[CMD] ERROR: Missing type value");
        return;
      }
      Serial.printf("[CMD] module info: %d \n", data[1]);
      getModuleInfo(data[1]);
      break;

    // -------------------------------------------------
    // REBOOT ESP32 (0xF0)
    // -------------------------------------------------
    case 0xF0:
      Serial.println("[CMD] Reboot ESP32");
      delay(200);
      ESP.restart();
      break;

    // -------------------------------------------------
    // UNKNOWN COMMAND
    // -------------------------------------------------
    default:
      Serial.printf("[CMD] Unknown binary command: 0x%02X (len=%d)\n", cmd, (int)len);
      break;
  }
}

//////////////////////////////////////////////////////////////////////////


/////////////////////////// Battery & WIFI RSSI //////////////////////////
/*void wifiRssiTask(void* param) {
  uint8_t buf[3];

  for (;;) {
    if (ws.isConnected()) {
      buf[0] = 0xEE;                 // message type
      buf[1] = hb;                   // module number
      buf[2] = (int8_t)WiFi.RSSI();  // <-- direct but safe

      ws.sendBIN(buf, 3);
    }

    vTaskDelay(30000 / portTICK_PERIOD_MS);
  }
}
void batteryVoltageTask(void* param) {
  uint8_t buf[3];

  for (;;) {
    if (ws.isConnected()) {
      float v = readBatteryVoltage();  // e.g., 3.87

      // Convert to one byte: 3.87 → 38
      uint8_t vByte = (uint8_t)(v * 10.0f + 0.5f);

      buf[0] = 0xDD;   // battery packet
      buf[1] = hb;     // module number
      buf[2] = vByte;  // encoded voltage

      ws.sendBIN(buf, 3);
    }

    vTaskDelay(45000 / portTICK_PERIOD_MS);  // every 45 seconds
  }
}*/
float readBatteryVoltage() {
  // ---------- BATTERY VOLTAGE READER FOR LOLIN D32 ----------
  // Uses ADC1_CH7 = GPIO35 and internal 100k/100k divider (battery/2)
  long sum = 0;

  // Take 10 samples to smooth noise
  for (int i = 0; i < 10; i++) {
    sum += analogRead(35);
    vTaskDelay(2 / portTICK_PERIOD_MS);
  }

  float raw = sum / 10.0f;

  // Convert raw ADC → voltage
  float adcVoltage = (raw / 4095.0f) * 3.3f;

  // Because LOLIN D32 uses 100k/100k divider → multiply by 2
  float batteryVoltage = adcVoltage * 2.0f;

  return batteryVoltage;
}
//////////////////////////////////////////////////////////////////////////


void setup() {
  Serial.begin(115200);
  delay(500);

  // --- Battery ADC configuration ---
  analogReadResolution(12);               // 12-bit ADC (0–4095)
  analogSetPinAttenuation(35, ADC_11db);  // proper attenuation for 3.3V range

  delay(500);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(100);

  delay(500);

  ws.begin(host, port, "/jrd100");
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(5000);

  delay(800);


  pinMode(JRD_EN, OUTPUT);
  digitalWrite(JRD_EN, HIGH);  // enable JRD

  delay(1000);

  RFID.begin(115200, SERIAL_8N1, JRD_RX, JRD_TX);

  delay(1000);

  xTaskCreatePinnedToCore(
    readRxUARTTask,       // function
    "Read Rx UART Task",  // name
    4096,                 // stack size
    NULL,                 // param
    2,                    // priority (higher than loop)
    NULL,                 // task handle
    1                     // run on core 1
  );

  delay(300);

  /*
  xTaskCreatePinnedToCore(
    serialInputStringHandlerTask,        // function
    "Serial Input String Handler Task",  // name
    4096,                                // stack size
    NULL,                                // param
    1,                                   // priority پایین‌تر از UART reader
    NULL,                                // task handle
    1                                    // run on core 1
  );

  delay(300);

  xTaskCreatePinnedToCore(
    heartbeatTask,
    "Heartbeat Task",
    2048,
    NULL,
    1,  // low priority
    NULL,
    0  // run on core 0
  );

  delay(300);

  xTaskCreatePinnedToCore(
    wifiRssiTask,
    "WiFi RSSI Task",
    2048,
    NULL,
    1,
    NULL,
    0  // run on core 0
  );

  delay(300);

  xTaskCreatePinnedToCore(
    batteryVoltageTask,
    "Battery Voltage Task",
    4096,
    NULL,
    1,  // lowest priority
    NULL,
    0  // run on core 0
  );
  */
  Serial.println("JRD100 Ready...");

  // Serial.println("=====================================");
  // Serial.println("   JRD100 Command Helper Menu");
  // Serial.println("=====================================");
  // Serial.println(" s   → Start continuous inventory");
  // Serial.println(" t   → Stop continuous inventory");
  // Serial.println(" g   → Get current RF power");
  // Serial.println(" pXX → Set power (dBm)   e.g. p26");
  // Serial.println(" rXX → Set region (hex)  e.g. r02");
  // Serial.println("         Regions:");
  // Serial.println("           01 = China 900 MHz");
  // Serial.println("           04 = China 800 MHz");
  // Serial.println("           02 = USA");
  // Serial.println("           03 = Europe");
  // Serial.println("           06 = Korea");
  // Serial.println(" h   → Get hardware version");
  // Serial.println(" v   → Get software version");
  // Serial.println(" m   → Get manufacturer info");
  // Serial.println("-------------------------------------");
  // Serial.println(" Notes:");
  // Serial.println("  - END commands with Enter/Space/; ");
  // Serial.println("  - Example:  p26   (sets 26 dBm)");
  // Serial.println("  - Example:  r02   (sets US region)");
  // Serial.println("=====================================");
}


void loop() {
  ws.loop();  // <-- this is essential

  unsigned long now = millis();

  if (ws.isConnected()) {

    // ---- Heartbeat هر ۳ ثانیه ----
    if (now - lastHbMs >= 3000) {
      ws.sendBIN(&hb, 1);  // همون چیزی که قبلاً در heartbeatTask می‌فرستادی
      lastHbMs = now;
    }

    // ---- WiFi RSSI هر ۳۰ ثانیه ----
    if (now - lastRssiMs >= 30000) {
      uint8_t buf[3];
      buf[0] = 0xEE;
      buf[1] = hb;
      buf[2] = (int8_t)WiFi.RSSI();
      ws.sendBIN(buf, 3);
      lastRssiMs = now;
    }

    // ---- Battery Voltage هر ۴۵ ثانیه ----
    if (now - lastBattMs >= 45000) {
      uint8_t buf[3];

      float v = readBatteryVoltage();
      uint8_t vByte = (uint8_t)(v * 10.0f + 0.5f);

      buf[0] = 0xDD;
      buf[1] = hb;
      buf[2] = vByte;

      ws.sendBIN(buf, 3);
      lastBattMs = now;
    }
  }
  delay(10);  // small yield; 10ms is fine
}
