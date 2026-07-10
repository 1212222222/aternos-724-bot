const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoogleGenAI, Type } = require('@google/genai');

// 1. Yapay Zeka ve Sunucu Ayarları
const GEMINI_API_KEY = 'BURAYA_API_KEY_YAZ'; // Kendi Gemini API Key'ini yapıştır knk
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const botOptions = {
    host: 'Verity-PGWq.aternos.me', 
    port: 25565,                         
    username: 'Akıllı',              
    version: '1.21.11'               
};

let bot = mineflayer.createBot(botOptions);
bot.loadPlugin(pathfinder);

// Botun kendi kendine karar verip hafızaya alacağı görev metni
let aktifArkaPlanGorevi = null; 

bot.on('spawn', () => {
    console.log(`${bot.username} %100 Yapay Algı Modülü Aktif!`);
    const defaultMovements = new Movements(bot, require('minecraft-data')(bot.version));
    bot.pathfinder.setMovements(defaultMovements);

    // Sunucudan düşüp geri girdiyse ve hafızasındaki iş uzun vadeliyse devam etsin
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
                temperature: 0.1, // Hata yapmaması için çok kararlı çalıştırıyoruz
                // Gemini'ın bize vereceği cevabın kalıbını zorunlu kılıyoruz:
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

        // Gemini'dan gelen kesin yanıtı JSON olarak ayrıştırıyoruz
        const analizSonucu = JSON.parse(response.text.trim());

        console.log("--- GEMINI ALGI VE KARAR ÇIKTISI ---");
        console.log(`Uzun Vadeli Görev mi?: ${analizSonucu.uzunVadeliGorevMi}`);
        console.log(`Üretilen Kod:\n${analizSonucu.javascriptKodu}`);
        console.log("------------------------------------");

        // Eğer Gemini bunun bir arkadan iş bırakıp ayrılma durumu olduğunu onayladıysa hafızaya al
        if (analizSonucu.uzunVadeliGorevMi === true) {
            aktifArkaPlanGorevi = oyuncuMesaji;
        }

        // Kodu canlı olarak bota enjekte et ve çalıştır
        eval(analizSonucu.javascriptKodu);

    } catch (error) {
        console.error('Beyin İşlemcisi Hatası:', error);
    }
}

// 3. Chat Dinleyici (Sıfır Filtre, Direkt Beyne Sevk)
bot.on('chat', async (username, message) => {
    if (username === bot.username) return;

    // Gelen mesajda ne yazdığına bakmaksızın direkt Gemini'ın yorumlamasına gönderiyoruz
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
