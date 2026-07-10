const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoogleGenAI, Type } = require('@google/genai');

// 1. Yapay Zeka ve Sunucu Ayarları
const GEMINI_API_KEY = 'AQ.Ab8RN6JqZF3JPiCGKtgbq20YtD-Fj6CBa3skvPLrNAKSSTAS3g'; // Geçerli API Key'ini buraya koy knk
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const botOptions = {
    host: 'Verity-PGWq.aternos.me', 
    port: 25565,                         
    username: 'Kole',
    version: false 
};

let bot = mineflayer.createBot(botOptions);
bot.loadPlugin(pathfinder);

let aktifArkaPlanGorevi = null; 

bot.on('spawn', () => {
    console.log(`${bot.username} başarıyla sunucuya giriş yaptı!`);
    
    const mcData = require('minecraft-data')(bot.version);
    const defaultMovements = new Movements(bot, mcData);
    
    defaultMovements.canDig = false; 
    bot.pathfinder.setMovements(defaultMovements);

    if (aktifArkaPlanGorevi) {
        beyinIslemcisi(aktifArkaPlanGorevi, "Sistem");
    }
});

// 2. Tamamen Özgür ve Kilitlenmeyen Beyin İşlemcisi
async function beyinIslemcisi(oyuncuMesaji, gonderenOyuncu) {
    try {
        const sistemTalimati = `
        Sen bağımsız ve çok zeki bir Minecraft yapay zeka botusun. Sana gelen mesajı analiz et ve sadece Mineflayer kütüphanesini kullanarak gerçekleştirilecek saf bir JavaScript kodu yaz.
        
        Kullanabileceğin global değişkenler ve kütüphaneler:
        - 'bot': Mineflayer bot nesnesi
        - 'pathfinder': Botun pathfinder eklentisi
        - 'Movements': Yeni hareket kuralları oluşturmak için (require('mineflayer-pathfinder').Movements)
        - 'goals': Hedef tanımlamaları için (require('mineflayer-pathfinder').goals)
        
        Örnek Hedef Belirleme Kuralları:
        - Oyuncuyu takip etmek için: const { GoalFollow } = goals; const target = bot.players['${gonderenOyuncu}']?.entity; if (target) { bot.pathfinder.setGoal(new GoalFollow(target, 1), true); } else { bot.chat("Seni fiziksel olarak dünyada göremiyorum knk, biraz yakınıma gel."); }
        - Durmak için: bot.pathfinder.setGoal(null);
        
        Kurallar:
        - Kodun en başına mutlaka 'bot.chat("...")' ile oyuncuya ne yapacağını bildiren Türkçe bir mesaj ekle.
        - Çıktıyı kesinlikle sana verilen JSON şemasına uygun olarak döndür.
        - Kod alanında asla markdown (\`\`\`) kullanma, sadece ham kod metni olsun.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
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
                            description: 'Oyuncu cümlesinde kalıcı bir iş bırakıyorsa true, anlık bir emir veya normal sohbetyse false yap.'
                        }
                    },
                    required: ['javascriptKodu', 'uzunVadeliGorevMi']
                }
            }
        });

        const analizSonucu = JSON.parse(response.text.trim());

        console.log("--- GEMINI KOD ÇIKTISI ---");
        console.log(`Üretilen Kod:\n${analizSonucu.javascriptKodu}`);
        console.log("--------------------------");

        if (analizSonucu.javascriptKodu.includes('process') || analizSonucu.javascriptKodu.includes('require')) {
            return;
        }

        if (analizSonucu.uzunVadeliGorevMi === true) {
            aktifArkaPlanGorevi = oyuncuMesaji;
        }

        // Üretilen kod buradaki hata havuzunda çalıştırılır, botu dilsiz bırakmaz!
        eval(analizSonucu.javascriptKodu);

    } catch (error) {
        console.error('Beyin İşlemcisi Hatası:', error);
        bot.chat("Mesajını tam anlayamadım ya da bir hata oluştu knk.");
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
