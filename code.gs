const TOKEN = "YOUR_TOKEN";

function doGet() {
  return HtmlService.createHtmlOutput("<h1>Bot is running</h1><p>Telegram bot webhook is active.</p>");
}

function doPost(e) {
  try {
    if (!e || !e.postData) {
      return HtmlService.createHtmlOutput();
    }

    const data = JSON.parse(e.postData.contents);
    Logger.log(JSON.stringify(data));

    // --- ЗАХИСТ ВІД ПОВТОРНИХ UPDATE ---
    const props = PropertiesService.getScriptProperties();
    const updateId = data.update_id;
    const lastId = props.getProperty("LAST_UPDATE_ID");

    if (lastId && Number(updateId) <= Number(lastId)) {
      Logger.log(`Пропущено оновлення ${updateId} (вже оброблено)`);
      return HtmlService.createHtmlOutput();
    }

    props.setProperty("LAST_UPDATE_ID", updateId);
    // -----------------------------------

    // Перевіряємо наявність повідомлення
    if (!data.message) {
      return HtmlService.createHtmlOutput();
    }

    const chatId = data.message.chat.id;
    
    // Перевіряємо чи є текст у повідомленні
    if (!data.message.text) {
      sendMessage(chatId, "❌ Будь ласка, надішліть текстове повідомлення");
      return HtmlService.createHtmlOutput();
    }

    const text = data.message.text.trim();
    Logger.log(`Отримано повідомлення: "${text}" від ${chatId}`);

    // Обробка команд
    if (text.startsWith("/")) {
      if (text === "/start" || text === "/help") {
        sendMessage(chatId,
`👋 Привіт! Я WAKE бот для створення подій у календарі свого власника.

Напиши мені подію у форматі:

📅 Приклади:
• 15:00 дзвінок
• завтра 14:30 зустріч
• 12.03 16 стоматолог
• через 2 години дзвінок

Я створю подію у твоєму календарі на 30 хвилин.`);
      }
      return HtmlService.createHtmlOutput();
    }

    // Парсимо дату з повідомлення
    const parsed = parseDate(text);

    if (!parsed) {
      sendMessage(chatId, "❌ Не зміг зрозуміти дату та час. Спробуй у форматі:\n• 15:00 дзвінок\n• завтра 14:30 зустріч\n• 12.03 16 стоматолог");
      return HtmlService.createHtmlOutput();
    }

    // Отримуємо календар
    const calendar = CalendarApp.getDefaultCalendar();
    
    if (!calendar) {
      sendMessage(chatId, "❌ Не вдалося отримати доступ до календаря");
      return HtmlService.createHtmlOutput();
    }

    // Створюємо подію (30 хвилин)
    const start = parsed.date;
    const end = new Date(start.getTime() + 30 * 60000);

    // Перевіряємо чи дата в майбутньому
    if (start < new Date()) {
      sendMessage(chatId, "❌ Не можна створювати події в минулому");
      return HtmlService.createHtmlOutput();
    }

    const event = calendar.createEvent(parsed.title, start, end);
    
    if (event) {
      // Форматуємо час для відповіді
      const hours = start.getHours().toString().padStart(2, '0');
      const minutes = start.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      
      // Відправляємо підтвердження
      const response = 
`✅ Найс! Подію успішно створено!

📌 ${parsed.title}
📅 ${parsed.day}
🕒 ${timeStr}
⏱ Тривалість: 30 хвилин

Чекні у своєму календарі!`;
      
      sendMessage(chatId, response);
      Logger.log(`Подію створено: ${parsed.title} на ${parsed.day} ${timeStr}`);
    } else {
      sendMessage(chatId, "❌ Помилка при створенні події");
    }

  } catch(err) {
    Logger.log("ПОМИЛКА: " + err.toString());
    Logger.log("Стек: " + err.stack);
    
    // Сповіщаємо користувача про помилку
    try {
      if (e && e.postData) {
        const data = JSON.parse(e.postData.contents);
        if (data.message && data.message.chat) {
          sendMessage(data.message.chat.id, "❌ Виникла внутрішня помилка. Спробуйте пізніше.");
        }
      }
    } catch (sendErr) {
      Logger.log("Не вдалося відправити повідомлення про помилку: " + sendErr);
    }
  }

  return HtmlService.createHtmlOutput();
}

function parseDate(text) {
  text = text.toLowerCase().trim();
  Logger.log(`Парсинг тексту: "${text}"`);

  let m;

  // завтра
  m = text.match(/^завтра\s+(\d{1,2}):(\d{2})\s+(.+)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const title = m[3];

    if (h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }

    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, min, 0, 0);

    const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
    const dayName = days[d.getDay()];

    return {
      date: d,
      title: title,
      day: `Завтра (${dayName})`,
      time: `${h}:${min.toString().padStart(2, '0')}`
    };
  }

  // дата у форматі ДД.ММ ГГ:ХХ
  m = text.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):?(\d{0,2})\s+(.+)$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const h = Number(m[3]);
    const min = m[4] ? Number(m[4]) : 0;
    const title = m[5];

    if (day < 1 || day > 31 || month < 0 || month > 11 || h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }

    const d = new Date();
    d.setFullYear(d.getFullYear(), month, day);
    d.setHours(h, min, 0, 0);

    return {
      date: d,
      title: title,
      day: `${day}.${(month+1).toString().padStart(2, '0')}`,
      time: `${h}:${min.toString().padStart(2, '0')}`
    };
  }

  // через X годин
  m = text.match(/^через\s+(\d+)\s+год/);
  if (m) {
    const hours = Number(m[1]);
    
    if (hours < 1 || hours > 24) {
      return null;
    }

    const d = new Date();
    d.setHours(d.getHours() + hours);

    // Округлюємо до найближчих 5 хвилин
    const minutes = d.getMinutes();
    d.setMinutes(Math.ceil(minutes / 5) * 5, 0, 0);

    return {
      date: d,
      title: text.replace(/^через\s+\d+\s+год\s*/, '').trim() || "Подія",
      day: `Через ${hours} год`,
      time: `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
    };
  }

  // сьогодні
  m = text.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const title = m[3];

    if (h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }

    const d = new Date();
    d.setHours(h, min, 0, 0);

    const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
    const dayName = days[d.getDay()];

    return {
      date: d,
      title: title,
      day: `Сьогодні (${dayName})`,
      time: `${h}:${min.toString().padStart(2, '0')}`
    };
  }

  Logger.log(`Не вдалося розпарсити: "${text}"`);
  return null;
}

function sendMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML"
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (!result.ok) {
      Logger.log(`Помилка відправки повідомлення: ${result.description}`);
    }
    
    Logger.log(`Повідомлення відправлено користувачу ${chatId}`);
  } catch(err) {
    Logger.log(`Помилка в sendMessage: ${err.toString()}`);
  }
}