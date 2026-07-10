// =====================================================================
// 🔥 MUTEŞEM MAFYA HACK: SÜRÜM KONTROL MEKANİZMASINI HAFIZADAN SİLME 🔥
// =====================================================================
try {
    const protocolCheckPath = require.resolve('minecraft-protocol/src/client/versionChecking.js');
    require.cache[protocolCheckPath] = {
        id: protocolCheckPath,
        filename: protocolCheckPath,
        loaded: true,
        exports: function(client, options) {
            // Sürüm kontrol fonksiyonunu tamamen felç ettik. Artık hata MATA fırlatamaz!
            return true;
        }
    };
    console.log("-> Sürüm kontrol filtresi hafızadan tamamen silindi.");
} catch (e) {
    console.log("-> Filtre silme adımı atlandı.");
}

// Kütüphanelerin listelerine 1.21.11 aşısını yapıyoruz
const mineflayer = require('mineflayer');
const protocol = require('minecraft-protocol');
const mcDataModule = require('minecraft-data');

if (mineflayer.supportedVersions && !mineflayer.supportedVersions.includes('1.21.11')) {
    mineflayer.supportedVersions.push('1.21.11');
}
if (protocol.supportedVersions && !protocol.supportedVersions.includes('1.21.11')) {
    protocol.supportedVersions.push('1.21.11');
}

// minecraft-data kütüphanesine sahte 1.21.11 verisi enjekte ediyoruz
const orijinalMcData = require('minecraft-data');
const sahteMcData = (version) => {
    if (version === '1.21.11') return orijinalMcData('1.21');
    return orijinalMcData(version);
};
Object.getOwnPropertyNames(orijinalMcData).forEach(prop => {
    try { sahteMcData[prop] = orijinalMcData[prop]; } catch (e) {}
});
if (sahteMcData.versions && sahteMcData.versions.pc) {
    sahteMcData.versions.pc['1.21.11'] = sahteMcData.versions.pc['1.21'];
}
require.cache[require.resolve('minecraft-data')].exports = sahteMcData;
// =====================================================================

const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoogleGenAI, Type } = require('@google/genai');

// 1. Yapay Zeka ve Sunucu Ayarları
const GEMINI_API_KEY = 'AQ.Ab8RN6KJsdkXP223zsRfPoxUAYY3aDMiro3MMryxxeUVg1Czmw'; // Kendi Gemini API Key'ini buraya yapıştır knk
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const botOptions = {
    host: 'Verity-PGWq.aternos.me', 
    port: 25565,                         
    username: 'Kole',
    version: '1.21.11' // Artık sunucunun kendi sürümünü korkusuzca yazabiliyoruz!
};

let bot = mineflayer.createBot(botOptions);
bot.loadPlugin(pathfinder);

let aktifArkaPlanGorevi = null; 

bot.on('spawn', () => {
    console.log(`${bot.username} Sürüm Engeli Tamamen Parçalandı, %100 Yapay Algı Aktif!`);
    const defaultMovements = new Movements(bot, require('minecraft-data')('1.21'));
    bot.pathfinder.setMovements(defaultMovements);

    if (aktifArkaPlanGorevi) {
        console.log("Hafızadaki arka plan görevi sürdürülüyor...");
        beyinIslemcisi(aktifArkaPlanGorevi, "Sistem");
    }
});

// 2. Ana Beyin ve Algı Fonksiyonu
async function beyinIslemcisi(oyuncuMesaji, gonderenOyuncu) {
    try {
        const sistemTalimati = `
        Sen bağımsız ve çok zeki bir Minecraft yapay zeka botusun. Oyuncunun attığı mesajı analiz et ve iki görevi yerine getir:
        
        1. Oyuncunun ne istediğini anla ve bunu Mineflayer kütüphanesini kullanarak yapacak saf bir JavaScript kodu yaz. 
           - 'bot', 'mineflayer', 'pathfinder', 'Movements', 'goals' değişkenleri sana açıktır.
           - Kodun en başına mutlaka 'bot.chat("...")' ile oyuncuya ne yapacağını bildiren bir mesaj ekle.
           
        2. Cümlenin anlamını tart. Eğer oyuncu oyundan ayrılacağını, çıkacağını, gideceğini ima ediyor ve arkasından uzun süreli bir iş (maden kazmak, tarlaya bakmak, nöbet tutmak vb.) bırakıyorsa bunu tespit et.
        
        Kurallar:
        - Çıktıyı kesinlikle sana verilen JSON şemasına uygun olarak döndür.
        - Kod alanında asla markdown (\`\`\`) kullanma, sadece ham kod metni olsun.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: oyuncuMesaji,
            config: {
                systemInstruction: sistemTalimati,
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        javascriptKodu: {
                            type: Type.STRING,
                            description: 'Görevi gerçekleştirecek saf, çalıştırılabilir JavaScript kodu.'
                        },
                        uzunVadeliGorevMi: {
                            type: Type.BOOLEAN,
                            description: 'Oyuncu cümlesinde çıkacağını, gideceğini belirtip arkasından kalıcı bir iş bırakıyorsa true, anlık bir emir veya normal sohbetyse false yap.'
                        }
                    },
                    required: ['javascriptKodu', 'uzunVadeliGorevMi']
                }
            }
        });

        const analizSonucu = JSON.parse(response.text.trim());

        console.log("--- GEMINI ALGI VE KARAR ÇIKTISI ---");
        console.log(`Uzun Vadeli Görev mi?: ${analizSonucu.uzunVadeliGorevMi}`);
        console.log(`Üretilen Kod:\n${analizSonucu.javascriptKodu}`);
        console.log("------------------------------------");

        if (analizSonucu.uzunVadeliGorevMi === true) {
            aktifArkaPlanGorevi = oyuncuMesaji;
        }

        eval(analizSonucu.javascriptKodu);

    } catch (error) {
        console.error('Beyin İşlemcisi Hatası:', error);
    }
}

// 3. Chat Dinleyici
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    await beyinIslemcisi(message, username);
});

// 4. Bağlantı Koruması
bot.on('end', () => {
    setTimeout(() => {
        bot = mineflayer.createBot(botOptions);
        bot.loadPlugin(pathfinder);
    }, 10000);
});
bot.on('error', (err) => console.log('Sistem Hatası:', err));
