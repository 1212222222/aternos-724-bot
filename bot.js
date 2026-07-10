// 2. Sunucu Bağlantı Ayarları
const botOptions = {
    host: 'Verity-PGWq.aternos.me', // Senin sunucu IP'n[cite: 1]
    port: 25565,                         
    username: 'AfkDede_724',              
    version: '1.21.11'               // <--- BU SATIRI EKLEDİK (Sürümü sabitledik)
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
    console.log(`${bot.username} giriş yaptı!`);
    
    // Rastgele hareket (12 saniyede bir)
    setInterval(() => {
        if (!bot.entity) return;
        const eylem = Math.floor(Math.random() * 5);
        const sure = Math.floor(Math.random() * 2000) + 1000;

        if (eylem === 0) { bot.setControlState('forward', true); setTimeout(() => bot.setControlState('forward', false), sure); }
        else if (eylem === 1) { bot.setControlState('back', true); setTimeout(() => bot.setControlState('back', false), sure); }
        else if (eylem === 2) { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); }
        else if (eylem === 3) { bot.look((Math.random() * Math.PI * 2) - Math.PI, (Math.random() * Math.PI / 2) - (Math.PI / 4), true); }
        else if (eylem === 4) { bot.setControlState('left', true); setTimeout(() => bot.setControlState('left', false), sure); }
    }, 12000);

    // Rastgele sohbet (3-6 dakika arası)
    function sohbet() {
        setTimeout(() => {
            if (bot && bot.entity) {
                const msg = mesajHavuzu[Math.floor(Math.random() * mesajHavuzu.length)];
                bot.chat(msg);
            }
            sohbet();
        }, Math.floor(Math.random() * (360000 - 180000 + 1)) + 180000);
    }
    sohbet();
});

bot.on('end', () => {
    setTimeout(() => { bot = mineflayer.createBot(botOptions); }, 10000);
});
