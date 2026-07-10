// models.js
const fetch = require('node-fetch'); // Eğer yüklü değilse: npm install node-fetch
const API_KEY = process.env.GEMINI_API_KEY;

async function checkModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  
  console.log("--- SENİN ANAHTARININ ERİŞEBİLDİĞİ MODELLER ---");
  data.models.forEach(m => {
    console.log(`Model Adı: ${m.name} | Desteklediği: ${m.supportedMethodNames}`);
  });
}

checkModels();
