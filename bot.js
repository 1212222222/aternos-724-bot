const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalFollow } = goals;
const { GoogleGenAI, Type } = require('@google/genai');

// 1. Yapay Zeka ve Sunucu Ayarları
const GEMINI_API_KEY = 'AQ.Ab8RN6JqZF3JPiCGKtgbq20YtD-Fj6CBa3skvPLrNAKSSTAS3g'; // API Key'ini buraya koy knk
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
    
    // HAREKET MOTORUNU RESETLE VE GÜÇLENDİR
    const mcData = require('minecraft-data')(bot.version);
    const defaultMovements = new Movements(bot, mcData);
    
    // Botun bloklara takılmasını engellemek için kapıları ve pencereleri açabileceğini söyleyelim
    defaultMovements.canDig = false; // Duvarları kırarak gelmeye çalışmasın
    bot.pathfinder.setMovements(defaultMovements);

    if (aktifArkaPlanGorevi) {
        beyinIslemcisi(aktifArkaPlanGorevi, "Sistem");
    }
});

// 2. Hızlandırılmış Beyin İşlemcisi
async function beyinIslemcisi(oyuncuMesaji, gonderenOyuncu) {
    try {
        // Eğer oyuncu direkt "takip et" veya "gel" dediyse yapay zekayı hiç bekletmeden ANINDA hareket ettiriyoruz
        const mesajKucuk = oyuncuMesaji.toLowerCase();
        if (mesajKucuk.includes('takip et') || mesajKucuk.includes('gel') || mesajKucuk.includes('yanıma gel')) {
            const player = bot.players[gonderenOyuncu];
            if (player && player.entity) {
                bot.chat("Hemen geliyorum knk!");
                bot.pathfinder.setGoal(new GoalFollow(player.entity, 1), true);
                return;
            } else {
                bot.chat("Seni göremiyorum, çok uzakta mısın?");
                return;
            }
        }

        // Diğer karmaşık komutlar için yapay zekayı hafifletilmiş kurallarla çağırıyoruz
        const sistemTalimati = `
        Sen bir Minecraft botusun. Oyuncunun attığı mesaja göre Mineflayer kodu yaz.
        Sadece 'bot', 'pathfinder', 'Movements', 'goals' kullanabilirsin.
        JSON olarak çıktı ver:
        {
          "javascriptKodu": "kod buraya (markdown kullanma)",
          "uzunVadeliGorevMi": true/false
        }
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
                        javascriptKodu: { type: Type.STRING },
                        uzunVadeliGorevMi: { type: Type.BOOLEAN }
                    },
                    required: ['javascriptKodu', 'uzunVadeliGorevMi']
                }
            }
        });

        const analizSonucu = JSON.parse(response.text.trim());

        if (analizSonucu.javascriptKodu.includes('process') || analizSonucu.javascriptKodu.includes('require')) {
            return;
        }

        if (analizSonucu.uzunVadeliGorevMi === true) {
            aktifArkaPlanGorevi = oyuncuMesaji;
        }

        eval(analizSonucu.javascriptKodu);

    } catch (error) {
        console.error('Beyin Hatası:', error);
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
