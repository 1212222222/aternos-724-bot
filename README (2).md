# mc-ai-bot

Minecraft sunucusuna bağlanan, sohbet mesajlarını doğal dil olarak anlayan
ve hazır komut listesine bağlı kalmadan (AI ile) yorumlayıp uygulayan bir bot.

## Nasıl çalışır?
1. Oyuncu sohbete bir şey yazar: "git oduncu ol, bana 10 tane odun topla"
2. Mesaj + botun anlık durumu (konum, envanter, yakındaki oyuncular) Anthropic API'sine gönderilir.
3. AI, mesajı `mineBlock`, `gotoPlayer`, `craftItem` gibi temel aksiyonlardan oluşan bir JSON plana çevirir.
4. Bot bu planı sırayla çalıştırır.

Yeni bir istek "bilinen" bir komut olmasa bile, AI mevcut primitive'leri kombinleyerek
bir plan üretir (ör. "eve odun getir" → mineBlock + gotoCoords + say).

## Kurulum

```bash
git clone <bu-repo>
cd mc-ai-bot
npm install
```

`.env` dosyası oluştur (veya ortam değişkeni olarak ver):

```
ANTHROPIC_API_KEY=sk-ant-xxxx
MC_HOST=localhost
MC_PORT=25565
MC_USERNAME=AIBot
```

Çalıştır:

```bash
node index.js
```
(veya `.env` kullanmak istersen `npm install dotenv` yükleyip index.js'in en üstüne
`require('dotenv').config()` ekle.)

## Yeni aksiyon eklemek

`index.js` içindeki `actions` objesine yeni bir fonksiyon eklemen, sonra
`askAI` fonksiyonundaki `systemPrompt` içine bu aksiyonu tanımlaman yeterli.
AI otomatik olarak bu yeni yeteneği ne zaman kullanacağını öğrenir.

## GitHub Actions ile 7/24 çalıştırma (ÖNEMLİ NOTLAR)

⚠️ GitHub Actions, sürekli çalışan sunucular için resmi olarak tasarlanmamıştır:
- Her job maksimum **6 saat** sürebilir (workflow bunu 5sa50dk'da kesip kendini yeniden başlatacak şekilde ayarlandı).
- Job'lar arasında birkaç saniye-dakika kesinti olabilir (bot o an sunucudan düşer, sonra tekrar girer).
- Yoğun/sürekli kullanım GitHub tarafından fark edilirse workflow'unuz durdurulabilir. Public repo'larda Actions dakikaları ücretsiz ve sınırsıza yakındır, private repo'larda aylık dakika limiti vardır.

### Kurulum adımları

1. Bu klasörü GitHub'a push et:
```bash
git init
git add .
git commit -m "AI destekli Minecraft botu"
git branch -M main
git remote add origin <senin-repo-linkin>
git push -u origin main
```

2. Repo → **Settings → Secrets and variables → Actions → New repository secret** ile şunları ekle:
   - `ANTHROPIC_API_KEY` → Claude API anahtarın
   - `MC_HOST` → `Verity-PGWq.aternos.me`
   - `MC_PORT` → Aternos panelindeki port (genelde 25565 değil, farklı bir port olur, panelden bak)
   - `MC_USERNAME` → botun oyun içi kullanıcı adı

3. Repo → **Actions** sekmesine git, `mc-ai-bot-runner` workflow'unu seç, **Run workflow** ile ilk çalıştırmayı elle başlat. Ondan sonra kendi kendini otomatik yeniden tetikleyecek.

4. Aternos sunucusu tamamen kapalıysa (server durdurulmuşsa) botun bağlanabilmesi için Aternos panelinden sunucuyu "Start" etmen gerekir — bot sunucuyu açamaz, sadece açıkken içeride kalmasını/aktif kalmasını sağlar.

