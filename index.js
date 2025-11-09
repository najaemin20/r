const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');

const BOT_TOKEN = '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000; // 24 jam

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

let botActive = true;
const blockedUsers = new Set();
const mediaStore = new Map();
const pendingComments = new Map();

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
    if (err.code === 403) {
      blockedUsers.add(userId);
      console.warn(`❌ User ${userId} memblokir bot.`);
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
Kirim foto/video anonim atau dengan identitas kamu.  
→ Bot akan memberi token unik.

2️⃣ **📊 Rate Pap**
Masukkan token pap untuk melihat media dan beri reaksi emoji.  
Kamu juga bisa menambahkan komentar untuk pengirim pap.

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

// ===== Kirim Media =====
bot.on(['photo', 'video', 'document'], async (ctx) => {
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

  // === Kirim ke ADMIN & CHANNEL ===
  const msg = `📥 Pap baru dari ${getUserDisplay(ctx.from)}\n🔐 Token: \`${token}\``;
  await sendSafeMessage(ADMIN_ID, msg, { parse_mode: 'Markdown' });

  await sendSafeMessage(PUBLIC_CHANNEL_ID,
    `📸 Pap baru masuk!\n🔐 Token: <code>${token}</code>\n📝 Kirim token ini ke bot untuk lihat media.`,
    { parse_mode: 'HTML', protect_content: true }
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

// ===== Teks Umum =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '🔙 Kembali') {
    ctx.session = {};
    return showMainMenu(ctx);
  }

 // ===== Token Rating =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '🔙 Kembali') {
    ctx.session = {};
    return showMainMenu(ctx);
  }

  const rating = ctx.session.rating;
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
    if (data.fileType === 'photo') {
      sentMessage = await ctx.replyWithPhoto(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
    } else if (data.fileType === 'video') {
      sentMessage = await ctx.replyWithVideo(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
    } else {
      sentMessage = await ctx.replyWithDocument(data.fileId, { caption, parse_mode: 'Markdown', protect_content: true });
    }

    // ===== Auto delete media after 5 minutes (300.000 ms) =====
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(sentMessage.message_id);
        console.log(`🗑️ Media dengan token ${text} dihapus otomatis setelah 5 menit.`);
      } catch (err) {
        console.log('⚠️ Gagal menghapus media:', err.description || err.message);
      }
    }, 5 * 60 * 1000);

    ctx.session.rating = { stage: 'menunggu_emoji', token: text };
    await ctx.reply('Pilih emoji reaksi kamu:', emojiKeyboard);
    return;
  }

  // ===== Emoji Reaction =====
  if (ctx.session.rating?.stage === 'menunggu_emoji' && ['❤️','😍','🔥','😘','👍','💖','😂','🤯','😭','👎'].includes(text)) {
    const token = ctx.session.rating.token;
    const media = mediaStore.get(token);
    if (!media) return ctx.reply('⚠️ Pap tidak ditemukan.');

    await ctx.reply('Ketikkan komentar kamu (atau kirim "-" jika tidak ingin menulis komentar).');
    pendingComments.set(ctx.from.id, { token, emoji: text });
    ctx.session.rating = null;
    return;
  }

  // ===== Komentar =====
  if (pendingComments.has(ctx.from.id)) {
    const { token, emoji } = pendingComments.get(ctx.from.id);
    pendingComments.delete(ctx.from.id);
    const media = mediaStore.get(token);
    if (!media) return ctx.reply('⚠️ Pap tidak ditemukan.');

    const comment = text !== '-' ? text : '(tanpa komentar)';
    await sendSafeMessage(
      media.from,
      `📸 Pap kamu mendapat reaksi ${emoji} dari ${getUserDisplay(ctx.from)}!\n💬 Komentar: ${comment}`,
      { parse_mode: 'Markdown' }
    );

    await ctx.reply(`✅ Reaksi ${emoji} dan komentar kamu telah dikirim ke pengirim pap!`, { parse_mode: 'Markdown' });
    return showMainMenu(ctx);
  }

  // ===== Menfes =====
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, { parse_mode: 'Markdown', protect_content: true });
    await sendSafeMessage(ADMIN_ID, fullMsg + `\n\n👤 Dari: ${getUserDisplay(ctx.from)}`, { parse_mode: 'Markdown' });

    await ctx.reply('✅ Menfes kamu sudah dikirim!');
    return showMainMenu(ctx);
  }
});

  // ===== Menfes =====
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, { parse_mode: 'Markdown', protect_content: true });
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
