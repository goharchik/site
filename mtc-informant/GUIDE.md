📢 MTC Informant 1.1.0

Мод добавит для контроллера MTC информатор.
Подробный гайд в Telegram: https://t.me/+nmX5AM8xJG5lMTRi
Автор: нейросеть Claude
Создатель всех идей: Komarchik (TG: @komarchikoff)

━━━━━━━━━━━━━━━
✅ ЧТО НУЖНО
• Minecraft Bedrock 1.26 или новее
• Установленный MTC (Minecraft Transportation Controller)
• Экспериментальные настройки включать не нужно

━━━━━━━━━━━━━━━
📦 УСТАНОВКА
1. Открой файл MTC_Informant_1.1.0.mcaddon — Minecraft сам его импортирует.
2. В настройках мира включи оба пакета: «MTC Informant» в наборах поведения и в наборах ресурсов.
3. Зайди в мир.

━━━━━━━━━━━━━━━
🎮 КАК ПОЛЬЗОВАТЬСЯ
1. В творческом инвентаре открой вкладку «Предметы» (там же печки и верстаки) и возьми «Информатор MTC».
2. Подойди к составу MTC — не дальше 15 блоков.
3. Нажми предметом (ПКМ, на телефоне — долгое нажатие).
4. Первый раз выбери раздел информатора. Дальше этот раздел будет открываться сразу.
5. Нажми на звук — он заиграет в ОДНОМ вагоне, самом близком к тебе.
6. Чтобы выбрать другой раздел, нажми «« Назад к разделам» в самом верху.

В окне раздела видно название раздела и последний включённый звук.

❗ Пишет «Рядом нет вагона MTC»?
Под этой надписью информатор покажет ID сущностей рядом с тобой. Найди среди них вагон (например mtc:что-то) и впиши его начало (до двоеточия) в файл
MTC Informant BP/scripts/config.js → строка TRAIN_NAMESPACES = ['mtc'];
Если не помогает, впиши полный ID в TRAIN_ENTITY_IDS = ['mtc:что-то'];

━━━━━━━━━━━━━━━
🔊 КАК ДОБАВИТЬ СВОЙ ЗВУК

Шаг 0. Распакуй мод
.mcaddon — это обычный zip. Переименуй его в .zip и распакуй (на телефоне — ZArchiver). Внутри две папки: «MTC Informant BP» и «MTC Informant RP».

Шаг 1. Подготовь звук
• Формат .ogg
• МОНО (стерео будет звучать «в голове», а не из вагона)
• Имя файла латиницей без пробелов, например arsenalna.ogg
Перевести в .ogg моно можно в Audacity: Трек → Микширование → Стерео в моно, потом Файл → Экспорт → OGG.

Шаг 2. Положи файл
MTC Informant RP/sounds/mtcinformant/line1/arsenalna.ogg
(line1 — папка твоего раздела, можно назвать как угодно латиницей)

Шаг 3. Пропиши звук в MTC Informant RP/sounds/sound_definitions.json
Внутри «sound_definitions» добавь блок (не забудь запятую после предыдущего блока):

    "mtcinformant:line1.arsenalna": {
      "category": "neutral",
      "min_distance": 4.0,
      "max_distance": 48.0,
      "sounds": [ { "name": "sounds/mtcinformant/line1/arsenalna", "volume": 1.0 } ]
    }

• "mtcinformant:line1.arsenalna" — ID звука, всегда начинается с mtcinformant:
• "name" — путь к файлу БЕЗ .ogg
• "max_distance" — с какого расстояния слышно

Шаг 4. Добавь кнопку в информатор
Открой MTC Informant BP/scripts/config.js, найди нужный раздел и в его список sounds добавь строку:

      { id: 'mtcinformant:line1.arsenalna', name: 'Арсенальная' },

• id — тот же ID, что в шаге 3
• name — название, которое увидят игроки

Шаг 5. Запакуй и обнови
1. В ОБОИХ manifest.json (в BP и в RP) увеличь версию: "version": [1, 1, 0] → [1, 1, 1]. Это нужно везде, где встречается [1, 1, 0], в том числе в "dependencies".
2. Выдели обе папки, запакуй в zip, переименуй в .mcaddon и открой.
Без увеличения версии игра может оставить старую копию мода.

━━━━━━━━━━━━━━━
📁 КАК СДЕЛАТЬ НОВЫЙ РАЗДЕЛ
В MTC Informant BP/scripts/config.js в список SECTIONS добавь блок (после «},» предыдущего раздела):

  {
    id: 'line1',
    name: 'Линия 1',
    icon: 'textures/mtcinformant/ui/section',
    sounds: [
      { id: 'mtcinformant:line1.arsenalna', name: 'Арсенальная' },
      { id: 'mtcinformant:line1.dnipro', name: 'Днипро' },
    ],
  },

• id — короткое имя латиницей без пробелов. Потом не меняй его, иначе у игроков сбросится выбранный раздел.
• name — название раздела, его видят игроки
• sounds — звуки этого раздела (как в шаге 4)

Звуки для раздела добавляй по шагам 1–3, потом запакуй по шагу 5.

━━━━━━━━━━━━━━━
🚇 ЛИНИЯ ОТДЕЛЬНЫМ ДОПОЛНЕНИЕМ (проще всего)
Не хочешь лезть в файлы? Открой addon-maker.html (сборщик линий) прямо в браузере телефона:
1. Впиши название линии, например «Каховская линия».
2. Выбери иконку: сделай значок (цвет и текст, например 11А) или загрузи свою картинку. Эта иконка будет и у пака, и у кнопки линии.
3. Добавь свои .ogg. Названия кнопок возьмутся из имён файлов, их можно поменять и расставить по порядку.
4. Нажми «Собрать дополнение» и открой скачанный .mcaddon.
5. В мире включи и основной MTC Informant (1.1.0+), и дополнение. Линия появится в списке разделов.
Чтобы обновить дополнение: тот же ID линии и версия повыше (1.0.0 → 1.0.1).

━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━

📢 MTC Informant 1.1.0 (English)

This mod adds a passenger information system (informant) for the MTC controller.
Detailed guide on Telegram: https://t.me/+nmX5AM8xJG5lMTRi
Author: neural network Claude
Creator of all ideas: Komarchik (TG: @komarchikoff)

━━━━━━━━━━━━━━━
✅ REQUIREMENTS
• Minecraft Bedrock 1.26 or newer
• MTC (Minecraft Transportation Controller) installed
• No experimental toggles needed

━━━━━━━━━━━━━━━
📦 INSTALLATION
1. Open MTC_Informant_1.1.0.mcaddon — Minecraft imports it automatically.
2. In the world settings, enable "MTC Informant" in both Behavior Packs and Resource Packs.
3. Enter the world.

━━━━━━━━━━━━━━━
🎮 HOW TO USE
1. In the creative inventory, open the "Items" tab (where furnaces and crafting tables are) and take the "MTC Informant".
2. Go near an MTC train — no more than 15 blocks away.
3. Use the item (right click, or long press on mobile).
4. The first time, choose an informant section. After that, it opens right away.
5. Tap a sound — it plays in ONE car, the one closest to you.
6. To pick another section, tap "« Back to sections" at the very top.

The section screen shows the section name and the last sound you played.

❗ It says "No MTC car nearby"?
Below that message the informant lists the IDs of entities near you. Find the train car among them (for example mtc:something) and put its start (before the colon) into
MTC Informant BP/scripts/config.js → the line TRAIN_NAMESPACES = ['mtc'];
If that is not enough, put the full ID into TRAIN_ENTITY_IDS = ['mtc:something'];

━━━━━━━━━━━━━━━
🔊 HOW TO ADD YOUR OWN SOUND

Step 0. Unpack the mod
A .mcaddon is a normal zip file. Rename it to .zip and extract it (on mobile use ZArchiver). Inside there are two folders: "MTC Informant BP" and "MTC Informant RP".

Step 1. Prepare the sound
• .ogg format
• MONO (stereo plays "inside your head" instead of from the car)
• File name in Latin letters without spaces, e.g. arsenalna.ogg
In Audacity: Tracks → Mix → Mix Stereo Down to Mono, then File → Export → OGG.

Step 2. Put the file here
MTC Informant RP/sounds/mtcinformant/line1/arsenalna.ogg
(line1 is the folder of your section, name it however you like in Latin letters)

Step 3. Register the sound in MTC Informant RP/sounds/sound_definitions.json
Inside "sound_definitions" add this block (remember the comma after the previous block):

    "mtcinformant:line1.arsenalna": {
      "category": "neutral",
      "min_distance": 4.0,
      "max_distance": 48.0,
      "sounds": [ { "name": "sounds/mtcinformant/line1/arsenalna", "volume": 1.0 } ]
    }

• "mtcinformant:line1.arsenalna" — the sound ID, always starts with mtcinformant:
• "name" — path to the file WITHOUT .ogg
• "max_distance" — how far away it can be heard

Step 4. Add a button to the informant
Open MTC Informant BP/scripts/config.js, find the section and add a line to its sounds list:

      { id: 'mtcinformant:line1.arsenalna', name: 'Arsenalna' },

• id — the same ID as in step 3
• name — the title players will see

Step 5. Pack and update
1. In BOTH manifest.json files (BP and RP) raise the version: "version": [1, 1, 0] → [1, 1, 1]. Do it everywhere [1, 1, 0] appears, including "dependencies".
2. Select both folders, zip them, rename the zip to .mcaddon and open it.
Without a new version the game may keep the old copy of the mod.

━━━━━━━━━━━━━━━
📁 HOW TO MAKE A NEW SECTION
In MTC Informant BP/scripts/config.js add a block to the SECTIONS list (after the "}," of the previous section):

  {
    id: 'line1',
    name: 'Line 1',
    icon: 'textures/mtcinformant/ui/section',
    sounds: [
      { id: 'mtcinformant:line1.arsenalna', name: 'Arsenalna' },
      { id: 'mtcinformant:line1.dnipro', name: 'Dnipro' },
    ],
  },

• id — a short Latin name without spaces. Do not change it later, or players' chosen section resets.
• name — the section title players see
• sounds — the sounds of this section (as in step 4)

Add the section's sounds with steps 1–3, then pack it as in step 5.

━━━━━━━━━━━━━━━
🚇 A LINE AS A SEPARATE ADD-ON (easiest)
Don't want to edit files? Open addon-maker.html (the line builder) right in your phone's browser:
1. Enter the line name, e.g. "Kakhovskaya line".
2. Pick an icon: make a badge (color and text, e.g. 11A) or upload your own picture. The same icon is used for the pack and for the line button.
3. Add your .ogg files. Button names come from the file names; you can rename and reorder them.
4. Tap "Build add-on" and open the downloaded .mcaddon.
5. In the world enable both MTC Informant (1.1.0+) and the add-on. The line appears in the section list.
To update an add-on: keep the same line ID and raise the version (1.0.0 → 1.0.1).
