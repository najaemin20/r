// bot.js
const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

// === Konfigurasi ===
// Ganti dengan process.env.BOT_TOKEN atau langsung masukkan token di sini.
// PENTING: jangan commit token ke repo publik.
const BOT_TOKEN = process.env.BOT_TOKEN || '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000; // 24 jam

// === Setup Bot ===
const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

let botActive = true;
const blockedUsers = new Set();
const mediaStore = new Map(); // token -> {fileId, fileType, mode, from, caption, createdAt}
const pendingComments = new Map(); // reactorId -> { token, emoji, stage }

// ===== Utility =====
function generateToken(length = 4) {
  return crypto.randomBytes(length).toString('hex');
}

function getUserDisplay(user) {
  if (!user) return 'Tanpa Nama';
  if (user.username) return `@${user.username}`;
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

async function sendSafeMessage(userId, message, extra = {}) {
  try {
    await bot.telegram.sendMessage(userId, message, extra);
  } catch (err) {
    // Jika bot diblokir
    if (err && err.code === 403) {
      blockedUsers.add(userId);
      console.warn(`❌ User ${userId} memblokir bot.`);
    } else {
      console.error('Gagal kirim pesan:', err && err.message ? err.message : err);
    }
  }
}

// ===== Menu Utama =====
async function showMainMenu(ctx) {
  const markup = Markup.keyboard([
    ['📊 Rate Pap', '📸 Kirim Pap'],
    ['📨 Menfes', '🎬 Beli Video Premium'],
    ['ℹ️ Help']
  ]).resize();

  await ctx.reply('Selamat datang! Pilih menu di bawah ini:', markup);
}

// ===== HELP =====
bot.hears('ℹ️ Help', async (ctx) => {
  const helpMsg = `
📘 *Panduan Penggunaan Bot PAP*

1️⃣ **📸 Kirim Pap**
Kirim foto/video/audio/VN anonim atau dengan identitas kamu.  
→ Bot akan memberi token unik.

2️⃣ **📊 Rate Pap**
Masukkan token pap untuk melihat media dan beri reaksi emoji.  
Kamu juga bisa menambahkan komentar untuk pengirim pap setelah reaksi dikirim.

3️⃣ **📨 Menfes**
Kirim pesan anonim ke channel publik.

4️⃣ **🎬 Beli Video Premium**
Klik tautan di bawah untuk membeli video premium:  
👉 [@vvip_3_bot](https://t.me/vvip_3_bot)

🛠 Admin Command:
- /boton → Nyalakan bot  
- /botoff → Matikan bot
`;
  await ctx.reply(helpMsg, { parse_mode: 'Markdown' });
});

// ===== Start =====
bot.start(async (ctx) => {
  ctx.session = {};
  await showMainMenu(ctx);
});

// ===== Kirim Pap =====
bot.hears('📸 Kirim Pap', async (ctx) => {
  ctx.session.state = 'kirimPap';
  await ctx.reply('Ingin kirim pap sebagai?', Markup.keyboard([
    ['🙈 Anonim', '🪪 Identitas'],
    ['🔙 Kembali']
  ]).resize());
});

bot.hears(['🙈 Anonim', '🪪 Identitas'], async (ctx) => {
  const choice = ctx.message.text;
  const username = getUserDisplay(ctx.from);

  if (ctx.session.state === 'kirimPap') {
    ctx.session.kirimPap = {
      mode: choice === '🙈 Anonim' ? 'Anonim' : username,
      status: 'menunggu_media'
    };
    await ctx.reply(`✅ Kamu kirim sebagai *${ctx.session.kirimPap.mode}*. Sekarang kirim media-nya.`, { parse_mode: 'Markdown' });
  } else if (ctx.session.state === 'menfes') {
    ctx.session.menfes = {
      mode: choice === '🙈 Anonim' ? 'Anonim' : username,
      status: 'menunggu_pesan'
    };
    await ctx.reply(`✅ Kamu kirim menfes sebagai *${ctx.session.menfes.mode}*. Sekarang kirim pesan kamu.`, { parse_mode: 'Markdown' });
  }
});

// ===== Kirim Media (termasuk VN & Audio) =====
bot.on(['photo', 'video', 'document', 'voice', 'audio'], async (ctx) => {
  const sess = ctx.session.kirimPap;
  if (!sess || sess.status !== 'menunggu_media')
    return ctx.reply('⚠️ Pilih dulu menu "📸 Kirim Pap".');

  let file = null, fileType = '';
  if (ctx.message.photo) {
    file = ctx.message.photo.pop();
    fileType = 'photo';
  } else if (ctx.message.video) {
    file = ctx.message.video;
    fileType = 'video';
  } else if (ctx.message.document) {
    file = ctx.message.document;
    fileType = 'document';
  } else if (ctx.message.voice) {
    file = ctx.message.voice;
    fileType = 'voice';
  } else if (ctx.message.audio) {
    file = ctx.message.audio;
    fileType = 'audio';
  }

  const token = generateToken();

  mediaStore.set(token, {
    fileId: file.file_id,
    fileType,
    mode: sess.mode,
    from: ctx.from.id,
    caption: ctx.message.caption || '',
    createdAt: Date.now()
  });

  ctx.session.kirimPap = null;
  await ctx.reply(`✅ Media diterima!\n🔐 Token: \`${token}\`\n📩 Token ini juga dikirim ke admin.`, { parse_mode: 'Markdown' });

  // === Kirim ke ADMIN & CHANNEL (teks -> boleh diforward) ===
  const msg = `📥 Pap baru dari ${getUserDisplay(ctx.from)}\n🔐 Token: \`${token}\``;
  await sendSafeMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });

  await sendSafeMessage(PUBLIC_CHANNEL_ID,
    `📸 Pap baru masuk!\n🔐 Token: <code>${token}</code>\n📝 Kirim token ini ke bot untuk lihat media.`,
    { parse_mode: 'HTML' }
  );

  await showMainMenu(ctx);
});

// ===== Rate Pap =====
bot.hears('📊 Rate Pap', async (ctx) => {
  ctx.session.rating = { stage: 'menunggu_token' };
  await ctx.reply('🔢 Masukkan token pap yang ingin kamu lihat dan beri reaksi:', Markup.keyboard([
    ['🔙 Kembali']
  ]).resize());
});

// ===== Emoji Keyboard =====
const emojiKeyboard = Markup.keyboard([
  ['❤️', '😍', '🔥', '😘', '👍'],
  ['💖', '😂', '🤯', '😭', '👎'],
  ['🔙 Kembali']
]).resize();

// ===== Menfes =====
bot.hears('📨 Menfes', async (ctx) => {
  ctx.session.state = 'menfes';
  await ctx.reply('Ingin mengirim menfes sebagai?', Markup.keyboard([
    ['🙈 Anonim', '🪪 Identitas'],
    ['🔙 Kembali']
  ]).resize());
});

// ===== Beli Video Premium =====
bot.hears('🎬 Beli Video Premium', async (ctx) => {
  await ctx.reply(
    `🎬 Klik tautan di bawah untuk membeli video premium:\n👉 [@vvip_3_bot](https://t.me/vvip_3_bot)`,
    { parse_mode: 'Markdown' }
  );
});

// ===== Proses Teks =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '🔙 Kembali') {
    ctx.session = {};
    return showMainMenu(ctx);
  }

  const rating = ctx.session.rating;

  // ===== Rate Pap: Masukkan Token =====
  if (rating?.stage === 'menunggu_token') {
    const data = mediaStore.get(text);
    if (!data) return ctx.reply('❌ Token tidak valid.');
    if (Date.now() - data.createdAt > TOKEN_VALID_MS) {
      mediaStore.delete(text);
      return ctx.reply('⏳ Token kedaluwarsa.');
    }

    const captionText = data.caption ? `📝 *Keterangan:* ${data.caption}\n\n` : '';
    const caption = `📸 Pap dari ${data.mode}\n🔐 Token: \`${text}\`\n${captionText}Pilih emoji reaksi di bawah:`;

    let sentMessage;
    try {
      if (data.fileType === 'photo') {
        sentMessage = await ctx.replyWithPhoto(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
      } else if (data.fileType === 'video') {
        sentMessage = await ctx.replyWithVideo(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
      } else if (data.fileType === 'document') {
        sentMessage = await ctx.replyWithDocument(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
      } else if (data.fileType === 'voice') {
        // voice note
        sentMessage = await ctx.replyWithVoice(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
      } else if (data.fileType === 'audio') {
        sentMessage = await ctx.replyWithAudio(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
      }
    } catch (err) {
      console.error('Gagal kirim media:', err && err.message ? err.message : err);
      return ctx.reply('⚠️ Gagal memuat media.');
    }

    // Auto delete after 5 menit
    setTimeout(async () => {
      try { await ctx.deleteMessage(sentMessage.message_id); } 
      catch(e){ console.log('Gagal hapus media:', e && e.message ? e.message : e); }
    }, 5*60*1000);

    ctx.session.rating = { stage: 'menunggu_emoji', token: text };
    await ctx.reply('Pilih emoji reaksi kamu:', emojiKeyboard);
    return;
  }

  // ===== Emoji Reaction: langsung kirim reaksi ke pemilik media, lalu tanya komentar =====
  if (rating?.stage === 'menunggu_emoji' && ['❤️','😍','🔥','😘','👍','💖','😂','🤯','😭','👎'].includes(text)) {
    const token = rating.token;
    const media = mediaStore.get(token);
    if (!media) return ctx.reply('⚠️ Pap tidak ditemukan.');

    // Kirim reaksi segera ke pemilik media (tanpa komentar)
    try {
      await sendSafeMessage(
        media.from,
        `📸 Pap kamu mendapat reaksi ${text} dari ${getUserDisplay(ctx.from)}!\n💬 Komentar: (belum ada)`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Gagal kirim reaksi ke pemilik media:', e && e.message ? e.message : e);
    }

    // Simpan pending untuk memungkinkan user menambahkan komentar (opsional)
    pendingComments.set(ctx.from.id, { token, emoji: text, stage: 'tanya_komentar' });

    // Reset rating session (so they can open other flows but we still track pendingComments)
    ctx.session.rating = null;

    // Tanyakan apakah ingin mengirim komentar (setelah reaksi sudah dikirim)
    const markup = Markup.keyboard([
      ['📝 Kirim komentar', '❌ Tidak kirim komentar'],
      ['🔙 Kembali']
    ]).resize();

    await ctx.reply(`✅ Reaksi ${text} telah dikirim ke pengirim pap! Ingin menambahkan komentar juga?`, markup);
    return;
  }

  // ===== Tahap tanya komentar setelah reaksi otomatis =====
  if (pendingComments.has(ctx.from.id)) {
    const pending = pendingComments.get(ctx.from.id);

    // Jika user memilih tidak mengirim komentar -> cukup hapus pending dan kembali ke menu
    if (text === '❌ Tidak kirim komentar') {
      pendingComments.delete(ctx.from.id);
      await ctx.reply('✅ Oke — komentar tidak dikirim. Terima kasih!', { reply_markup: { remove_keyboard: true } });
      return showMainMenu(ctx);
    }

    // Jika user pilih mengirim komentar -> minta isi komentar
    if (text === '📝 Kirim komentar') {
      pending.stage = 'menunggu_isi_komentar';
      await ctx.reply('✍️ Tulis komentar kamu di bawah ini:');
      return;
    }

    // Jika user menulis komentar (stage menunggu_isi_komentar)
    if (pending.stage === 'menunggu_isi_komentar') {
      const { token, emoji } = pending;
      const media = mediaStore.get(token);
      if (!media) {
        pendingComments.delete(ctx.from.id);
        return ctx.reply('⚠️ Pap tidak ditemukan.');
      }

      const comment = text;
      pendingComments.delete(ctx.from.id);

      // Kirim komentar terpisah ke pemilik media
      await sendSafeMessage(
        media.from,
        `📸 Pap kamu mendapat komentar untuk reaksi ${emoji} dari ${getUserDisplay(ctx.from)}:\n\n💬 ${comment}`,
        { parse_mode: 'Markdown' }
      );

      await ctx.reply(`✅ Komentar kamu telah dikirim ke pengirim pap!`);
      return showMainMenu(ctx);
    }
  }

  // ===== Menfes =====
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, { parse_mode: 'Markdown' });
    await sendSafeMessage(ADMIN_ID, fullMsg + `\n\n👤 Dari: ${getUserDisplay(ctx.from)}`, { parse_mode: 'Markdown' });

    await ctx.reply('✅ Menfes kamu sudah dikirim!');
    return showMainMenu(ctx);
  }
});

// ===== Admin Commands =====
bot.command('boton', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  botActive = true;
  await ctx.reply('🤖 Bot dinyalakan.');
});

bot.command('botoff', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  botActive = false;
  await ctx.reply('🤖 Bot dimatikan.');
});

// ===== Launch Bot =====
bot.launch().then(() => console.log('✅ Bot is running...')).catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
