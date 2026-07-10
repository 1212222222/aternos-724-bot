const mineflayer = require('mineflayer'); // <--- Eksik olan ve hataya sebep olan satır burasıydı!

// 2. Sunucu Bağlantı Ayarları
const botOptions = {
    host: 'Verity-PGWq.aternos.me', 
    port: 25565,                         
    username: 'AfkDede_724',              
    version: '1.21.11'               
};

let bot = mineflayer.createBot(botOptions);

const mesajHavuzu = [
    "beyler madene inen var mı?",
    "spawnın oradaki tarlayı kim topladı ya da toplamadı?",
    "biraz odun kasıp geleceğim ben",
    "envanter acayip doldu, eve gidip sandığa boşaltmam lazım",
    "fırınlarda pişen demirler kimin? alabilir miyim biraz?",
    "baya acıktım oyunda, yemeği olan var mı?",
    "gece oluyor yatsak mı yatak yok mu kimsede?",
    "şu arkadaki dağa güzel bir ev mi yapsak ne dersiniz?",
    "creeper patladı ya kıl payı kurtuldum valla",
    "serverda lag mı var bana mı öyle geliyor?",
    "tamamdır ben buralardayım takılıyorum öyle"
];

bot.on('spawn', () => {
    console.log(`${bot.username} başarıyla giriş yaptı!`);
    
    // Rastgele hareket döngüsü (Her 12 saniyede bir karar verir)
    setInterval(() => {
        rastgeleHareketEt();
    }, 12000);

    // Rastgele sohbet döngüsü (Her 3 ila 6 dakika arasında)
    function sohbetDongusu() {
        const rastgeleSure = Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000;
        setTimeout(() => {
            if (bot && bot.entity) {
                const rastgeleMesaj = mesajHavuzu[Math.floor(Math.random() * mesajHavuzu.length)];
                bot.chat(rastgeleMesaj);
                console.log(`Bot Chat Mesajı Gönderdi: ${rastgeleMesaj}`);
            }
            sohbetDongusu();
        }, rastgeleSure);
    }
    
    sohbetDongusu();
});

// Aternos'u yanıltan hareket fonksiyonu
function rastgeleHareketEt() {
    if (!bot.entity) return;

    const eylemSecimi = Math.floor(Math.random() * 5);
    const rastgeleSure = Math.floor(Math.random() * 2000) + 1000;

    switch (eylemSecimi) {
        case 0:
            bot.setControlState('forward', true);
            setTimeout(() => bot.setControlState('forward', false), rastgeleSure);
            break;
        case 1:
            bot.setControlState('back', true);
            setTimeout(() => bot.setControlState('back', false), rastgeleSure);
            break;
        case 2:
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
            break;
        case 3:
            const yaw = (Math.random() * Math.PI * 2) - Math.PI;
            const pitch = (Math.random() * Math.PI / 2) - (Math.PI / 4);
            bot.look(yaw, pitch, true);
            break;
        case 4:
            bot.setControlState('left', true);
            setTimeout(() => bot.setControlState('left', false), rastgeleSure);
            break;
    }
}

// Bağlantı koparsa otomatik olarak 10 saniye sonra tekrar bağlanır
bot.on('end', () => {
    console.log('Bağlantı kesildi. Tekrar bağlanılıyor...');
    setTimeout(() => {
        bot = mineflayer.createBot(botOptions);
    }, 10000);
});

bot.on('error', (err) => console.log('Hata:', err));
