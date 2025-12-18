// src/services/mockSensors.js

// توليد رقم عشوائي بين حدين
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// الحالة الحالية للحساسات
let sensorState = {
  temperature: 22.0,
  humidity: 50,
  pressure: 1000,
  motion: false,
  gesture: "none",
};

// تحديث القيم بشكل واقعي
export function getMockSensorData() {
  sensorState = {
    temperature: randomBetween(18, 30),
    humidity: Math.round(randomBetween(40, 70)),
    pressure: Math.round(randomBetween(990, 1020)),
    motion: Math.random() > 0.7,
    gesture: ["none", "left", "right", "up", "down"][
      Math.floor(Math.random() * 5)
    ],
  };

  return sensorState;
}
