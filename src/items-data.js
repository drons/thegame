// Каталог предметов: униформный JS-модуль (фолбэк для file://).
//
// Source of truth — JSON-файлы каталога assets/items/*.json
// (один предмет — один файл, схема — assets/items/schema.json).
// GENERATED — не править руками, синхронизируется из assets/items (scripts/sync-items-data.js).
// Не редактируйте вручную: правьте JSON и пересобирайте модуль
// (node scripts/sync-items-data.js, npm sync:items).
//
// Униформный модуль: в браузере — flat-namespace globalThis.Game
// (поле ITEMS — items.js и vm-цепочки читают G.ITEMS, контракт
// без изменений, задача 000059), в node — require() (CommonJS).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — плоское поле Game.ITEMS (не Game.ItemsData).
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Предметы (assets/items/000001.json … 000076.json);
  // порядок массива = нумерация файлов.
  const ITEMS = [
    // 000001.json
    {
      id: "wood_sword",
      name: "Деревянный меч",
      kind: "weapon",
      subtype: "sword",
      weight: 1,
      value: 10,
      desc: "Простой деревянный меч: лёгкий, крепкий, не подводит.",
      stats: { damage: 3 },
    },
    // 000002.json
    {
      id: "iron_sword",
      name: "Железный меч",
      kind: "weapon",
      subtype: "sword",
      weight: 1.5,
      value: 40,
      desc: "Честный железный меч из пограничной кузницы.",
      stats: { damage: 5 },
    },
    // 000003.json
    {
      id: "steel_sword",
      name: "Стальной меч",
      kind: "weapon",
      subtype: "sword",
      weight: 2,
      value: 120,
      desc: "Стальной меч, отполированный в рыцарской кузнице.",
      stats: { damage: 7 },
    },
    // 000004.json
    {
      id: "short_bow",
      name: "Короткий лук",
      kind: "weapon",
      subtype: "bow",
      weight: 1,
      value: 30,
      desc: "Короткий охотничий лук: надёжен на близкой дистанции.",
      stats: { damage: 4 },
    },
    // 000005.json
    {
      id: "hunting_bow",
      name: "Охотничий лук",
      kind: "weapon",
      subtype: "bow",
      weight: 1.5,
      value: 90,
      desc: "Лук охотника — стрела летит далеко и точно.",
      stats: { damage: 6 },
    },
    // 000006.json
    {
      id: "battle_axe",
      name: "Боевой топор",
      kind: "weapon",
      subtype: "heavy",
      weight: 3,
      value: 150,
      desc: "Боевой топор: один удар — и щит трескается.",
      stats: { damage: 8 },
    },
    // 000007.json
    {
      id: "war_hammer",
      name: "Боевой молот",
      kind: "weapon",
      subtype: "heavy",
      weight: 4,
      value: 250,
      desc: "Боевой молот: вес и верный удар.",
      stats: { damage: 10 },
    },
    // 000008.json
    {
      id: "leather_armor",
      name: "Кожаный доспех",
      kind: "armor",
      weight: 2,
      value: 35,
      desc: "Мягкий кожаный доспех: защита без скрипа.",
      stats: { armor: 2 },
    },
    // 000009.json
    {
      id: "chainmail",
      name: "Кольчуга",
      kind: "armor",
      weight: 4,
      value: 140,
      desc: "Кольчуга: кольца, вплетённые мастерской рукой.",
      stats: { armor: 4 },
    },
    // 000010.json
    {
      id: "knight_plate",
      name: "Рыцарский доспех",
      kind: "armor",
      weight: 7,
      value: 400,
      desc: "Рыцарский латы: как ходячая крепость.",
      stats: { armor: 6 },
    },
    // 000011.json
    {
      id: "minor_healing",
      name: "Малое зелье лечения",
      kind: "potion",
      weight: 0.3,
      value: 4,
      desc: "Малое зелье лечения: раны затягиваются, сердце успокаивается.",
      effect: { kind: "heal", amount: 6 },
    },
    // 000012.json
    {
      id: "healing_potion",
      name: "Зелье лечения",
      kind: "potion",
      weight: 0.5,
      value: 10,
      desc: "Зелье лечения: красное, тёплое, пахнет клевером.",
      effect: { kind: "heal", amount: 15 },
    },
    // 000013.json
    {
      id: "greater_healing",
      name: "Большое зелье лечения",
      kind: "potion",
      weight: 0.5,
      value: 35,
      desc: "Большое зелье лечения: как будто целитель положил ладони.",
      effect: { kind: "heal", amount: 40 },
    },
    // 000014.json
    {
      id: "mana_potion",
      name: "Зелье маны",
      kind: "potion",
      weight: 0.5,
      value: 12,
      desc: "Зелье маны: голубая искра за глазами.",
      effect: { kind: "mp", amount: 10 },
    },
    // 000015.json
    {
      id: "mana_elixir",
      name: "Эликсир маны",
      kind: "potion",
      weight: 0.5,
      value: 40,
      desc: "Эликсир маны: ум проясняется, руны горят ярче.",
      effect: { kind: "mp", amount: 20 },
    },
    // 000016.json
    {
      id: "bread",
      name: "Хлеб",
      kind: "food",
      weight: 0.2,
      value: 2,
      desc: "Свежий хлеб: лучшее лекарство в дороге.",
      effect: { kind: "eat", amount: 4 },
    },
    // 000017.json
    {
      id: "meat",
      name: "Жареное мясо",
      kind: "food",
      weight: 0.4,
      value: 5,
      desc: "Жареное мясо с травами: силы для долгого перехода.",
      effect: { kind: "eat", amount: 8 },
    },
    // 000018.json
    {
      id: "honey_cake",
      name: "Медовый пирог",
      kind: "food",
      weight: 0.3,
      value: 8,
      desc: "Медовый пирог: немного сладкого — и день становится добрее.",
      effect: { kind: "eat", amount: 6 },
    },
    // 000019.json
    {
      id: "alchemy_manual",
      name: "Трактат алхимика",
      kind: "skill_book",
      weight: 0.5,
      value: 50,
      desc: "Практический трактат алхимика: рецепты и предостережения.",
      effect: { kind: "skill_xp", skill: "alchemy", amount: 10 },
    },
    // 000020.json
    {
      id: "sword_treatise",
      name: "Учение о мечах",
      kind: "skill_book",
      weight: 0.5,
      value: 60,
      desc: "Учение о мечах: от основ до цветка удара.",
      effect: { kind: "skill_xp", skill: "swordsman", amount: 10 },
    },
    // 000021.json
    {
      id: "archery_manual",
      name: "Азбука стрельбы",
      kind: "skill_book",
      weight: 0.5,
      value: 60,
      desc: "Азбука стрельбы: ветер, дыхание и отпускание.",
      effect: { kind: "skill_xp", skill: "accuracy", amount: 10 },
    },
    // 000022.json
    {
      id: "sulfur",
      name: "Сера",
      kind: "reagent",
      weight: 0.2,
      value: 3,
      desc: "Сера: пахнет нехорошо, зато в алхимике дорога.",
    },
    // 000023.json
    {
      id: "moonstone",
      name: "Лунный камень",
      kind: "reagent",
      weight: 0.1,
      value: 25,
      desc: "Лунный камень: слегка светится в темноте.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.04 },
      icon: "assets/sprites/loot/moonstone.svg",
    },
    // 000024.json
    {
      id: "phoenix_feather",
      name: "Перо феникса",
      kind: "reagent",
      weight: 0.05,
      value: 150,
      desc: "Перо феникса: тёплое на ощупь, редкая находка.",
    },
    // 000025.json
    {
      id: "stone_fist_grimoire",
      name: "Гримуар каменных кулаков",
      kind: "skill_book",
      weight: 0.4,
      value: 55,
      desc: "Гримуар каменных кулаков: техника удара, когда металл не при чём.",
      effect: { kind: "skill_xp", skill: "fists", amount: 25 },
    },
    // 000026.json
    {
      id: "iron_hide_tome",
      name: "Учение о железной коже",
      kind: "skill_book",
      weight: 0.4,
      value: 55,
      desc: "Учение о железной коже: как принимать удар и не вспоминать о нём.",
      effect: { kind: "skill_xp", skill: "hide", amount: 25 },
    },
    // 000027.json
    {
      id: "fire_spellbook",
      name: "Книга огненных заклинаний",
      kind: "skill_book",
      weight: 0.5,
      value: 60,
      desc: "Огненные заклинания: от искры до пламени, что ест камень.",
      effect: { kind: "skill_xp", skill: "firelord", amount: 25 },
    },
    // 000028.json
    {
      id: "ice_spellbook",
      name: "Книга ледяных заклинаний",
      kind: "skill_book",
      weight: 0.5,
      value: 60,
      desc: "Ледяные заклинания: стужа, что останавливает кровь в жилах.",
      effect: { kind: "skill_xp", skill: "icelord", amount: 25 },
    },
    // 000029.json
    {
      id: "heavy_tome",
      name: "Том великого топора",
      kind: "skill_book",
      weight: 0.6,
      value: 70,
      desc: "Тяжёлое оружие: вес, инерция и терпение.",
      effect: { kind: "skill_xp", skill: "heavy", amount: 30 },
    },
    // 000030.json
    {
      id: "archer_scroll",
      name: "Свиток лучника",
      kind: "skill_book",
      weight: 0.2,
      value: 45,
      desc: "Свиток лучника: дыхание, прицел, отпускание.",
      effect: { kind: "skill_xp", skill: "archer", amount: 15 },
    },
    // 000031.json
    {
      id: "meditation_scroll",
      name: "Свиток медитации",
      kind: "skill_book",
      weight: 0.2,
      value: 40,
      desc: "Свиток медитации: тишина, в которой ману слышно ушами.",
      effect: { kind: "skill_xp", skill: "meditation", amount: 15 },
    },
    // 000032.json
    {
      id: "nature_scroll",
      name: "Свиток сердца природы",
      kind: "skill_book",
      weight: 0.2,
      value: 40,
      desc: "Свиток сердца природы: травы, их вкусы и тайны.",
      effect: { kind: "skill_xp", skill: "nature", amount: 15 },
    },
    // 000033.json
    {
      id: "iron_ore",
      name: "Железная руда",
      kind: "reagent",
      weight: 1,
      value: 8,
      desc: "Железная руда: серый камень с тёмной металлической прожилкой.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.04 },
      icon: "assets/sprites/loot/iron_ore.svg",
    },
    // 000034.json
    {
      id: "copper_ore",
      name: "Медная руда",
      kind: "reagent",
      weight: 1,
      value: 6,
      desc: "Медная руда: зеленоватый налёт — металл для мелких дел.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.04 },
      icon: "assets/sprites/loot/copper_ore.svg",
    },
    // 000035.json
    {
      id: "wood_log",
      name: "Бревно",
      kind: "reagent",
      weight: 2,
      value: 3,
      desc: "Тяжёлое бревно: основа всякой столярной работы.",
      loot: { terrains: ["лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/wood_log.svg",
    },
    // 000036.json
    {
      id: "stone_chunk",
      name: "Каменный обломок",
      kind: "reagent",
      weight: 1.5,
      value: 4,
      desc: "Крепкий обломок камня: и в кузню годится, и под резец.",
    },
    // 000037.json
    {
      id: "hide",
      name: "Кожа",
      kind: "reagent",
      weight: 0.5,
      value: 5,
      desc: "Кожа зверя, высушенная и отбитая: мягкая, но держит удар.",
      loot: { terrains: ["лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/hide.svg",
    },
    // 000038.json
    {
      id: "coal",
      name: "Уголь",
      kind: "reagent",
      weight: 0.5,
      value: 2,
      desc: "Уголь: чёрный, лёгкий, горит жарко — топит кузнечный горн.",
    },
    // 000039.json
    {
      id: "herb_healing",
      name: "Трава исцеления",
      kind: "reagent",
      weight: 0.1,
      value: 2,
      desc: "Трава исцеления: горьковатая, но заваренная затягивает раны.",
      loot: { terrains: ["болото", "лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/herb_healing.svg",
    },
    // 000040.json
    {
      id: "herb_mana",
      name: "Манная трава",
      kind: "reagent",
      weight: 0.1,
      value: 3,
      desc: "Манная трава: в настойке шепчет об энергии, которой мало.",
      loot: { terrains: ["болото", "лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/herb_mana.svg",
    },
    // 000041.json
    {
      id: "herb_bitter",
      name: "Горечавка",
      kind: "reagent",
      weight: 0.1,
      value: 2,
      desc: "Горечавка: чистая горечь, без неё зелье не держится.",
      loot: { terrains: ["болото", "лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/herb_bitter.svg",
    },
    // 000042.json
    {
      id: "stone_chisel",
      name: "Каменный резец",
      kind: "reagent",
      weight: 0.3,
      value: 12,
      desc: "Каменный резец: грубый, но точит всё, что мягче камня.",
    },
    // 000043.json
    {
      id: "fireball_scroll",
      name: "Свиток: Огненный шар",
      kind: "spell_scroll",
      weight: 0.2,
      value: 60,
      desc: "Свиток: изучает «Огненный шар» (нужен ранг школы).",
      effect: { kind: "spell", spell: "fireball" },
    },
    // 000044.json
    {
      id: "flame_burst_scroll",
      name: "Свиток: Пламенный взрыв",
      kind: "spell_scroll",
      weight: 0.2,
      value: 120,
      desc: "Свиток: изучает «Пламенный взрыв» (нужны ранг школы и «Огненный шар»).",
      effect: { kind: "spell", spell: "flame_burst" },
    },
    // 000045.json
    {
      id: "frost_bolt_scroll",
      name: "Свиток: Морозная стрела",
      kind: "spell_scroll",
      weight: 0.2,
      value: 45,
      desc: "Свиток: изучает «Морозную стрелу» (нужен ранг школы).",
      effect: { kind: "spell", spell: "frost_bolt" },
    },
    // 000046.json
    {
      id: "blizzard_scroll",
      name: "Свиток: Метель",
      kind: "spell_scroll",
      weight: 0.2,
      value: 110,
      desc: "Свиток: изучает «Метель» (нужны ранг школы и «Морозная стрела»).",
      effect: { kind: "spell", spell: "blizzard" },
    },
    // 000047.json
    {
      id: "chill_scroll",
      name: "Свиток: Хлад",
      kind: "spell_scroll",
      weight: 0.2,
      value: 45,
      desc: "Свиток: изучает «Хлад» (нужен ранг школы).",
      effect: { kind: "spell", spell: "chill" },
    },
    // 000048.json
    {
      id: "light_heal_scroll",
      name: "Свиток: Свет исцеления",
      kind: "spell_scroll",
      weight: 0.2,
      value: 70,
      desc: "Свиток: изучает «Свет исцеления» (нужен ранг школы).",
      effect: { kind: "spell", spell: "light_heal" },
    },
    // 000049.json
    {
      id: "magic_shield_scroll",
      name: "Свиток: Магический щит",
      kind: "spell_scroll",
      weight: 0.2,
      value: 45,
      desc: "Свиток: изучает «Магический щит» (нужен ранг школы).",
      effect: { kind: "spell", spell: "magic_shield" },
    },
    // 000050.json
    {
      id: "vine_scroll",
      name: "Свиток: Плетень",
      kind: "spell_scroll",
      weight: 0.2,
      value: 50,
      desc: "Свиток: изучает «Плетень» (нужен ранг школы).",
      effect: { kind: "spell", spell: "vine" },
    },
    // 000051.json
    {
      id: "resurrect_scroll",
      name: "Свиток воскрешения",
      kind: "resurrection_scroll",
      weight: 0.5,
      value: 150,
      desc: "В бою (быстрый слот): возвращает первого погибшего союзника на поле боя (50% HP). Цель не выбирается.",
      effect: { kind: "resurrect" },
    },
    // 000052.json
    {
      id: "silver_ore",
      name: "Серебряная руда",
      kind: "reagent",
      weight: 1,
      value: 15,
      tier: 2,
      desc: "Серебряная руда: серо-белый камень с яркой серебристой прожилкой.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.025 },
      icon: "assets/sprites/loot/silver_ore.svg",
    },
    // 000053.json
    {
      id: "gold_ore",
      name: "Золотая руда",
      kind: "reagent",
      weight: 1,
      value: 30,
      tier: 3,
      desc: "Золотая руда: камень с тёмной коркой и золотистыми зернами.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.015 },
      icon: "assets/sprites/loot/gold_ore.svg",
    },
    // 000054.json
    {
      id: "mithril_ore",
      name: "Мифриловая руда",
      kind: "reagent",
      weight: 0.5,
      value: 80,
      tier: 4,
      desc: "Мифриловая руда: лёгкий серебристый камень, почти невесомый.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.005 },
      icon: "assets/sprites/loot/mithril_ore.svg",
    },
    // 000055.json
    {
      id: "quartz",
      name: "Кварц",
      kind: "reagent",
      weight: 0.2,
      value: 12,
      tier: 2,
      desc: "Кварц: полупрозрачный кристалл с белёсым блеском.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.025 },
      icon: "assets/sprites/loot/quartz.svg",
    },
    // 000056.json
    {
      id: "obsidian",
      name: "Обсидиан",
      kind: "reagent",
      weight: 0.5,
      value: 18,
      tier: 2,
      desc: "Обсидиан: чёрное вулканическое стекло.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.025 },
      icon: "assets/sprites/loot/obsidian.svg",
    },
    // 000057.json
    {
      id: "phosphorite",
      name: "Фосфорит",
      kind: "reagent",
      weight: 0.3,
      value: 25,
      tier: 3,
      desc: "Фосфорит: серо-зелёный камень с мерцающим светом.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.015 },
      icon: "assets/sprites/loot/phosphorite.svg",
    },
    // 000058.json
    {
      id: "ruby",
      name: "Рубин",
      kind: "reagent",
      weight: 0.1,
      value: 40,
      tier: 3,
      desc: "Рубин: красный самоцвет с тёплым внутренним светом.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.015 },
      icon: "assets/sprites/loot/ruby.svg",
    },
    // 000059.json
    {
      id: "sapphire",
      name: "Сапфир",
      kind: "reagent",
      weight: 0.1,
      value: 40,
      tier: 3,
      desc: "Сапфир: синий самоцвет, глубокий, как ночное небо.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.015 },
      icon: "assets/sprites/loot/sapphire.svg",
    },
    // 000060.json
    {
      id: "emerald",
      name: "Изумруд",
      kind: "reagent",
      weight: 0.1,
      value: 40,
      tier: 3,
      desc: "Изумруд: зелёный самоцвет с ясным внутренним огнём.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.015 },
      icon: "assets/sprites/loot/emerald.svg",
    },
    // 000061.json
    {
      id: "amethyst",
      name: "Аметист",
      kind: "reagent",
      weight: 0.1,
      value: 30,
      tier: 2,
      desc: "Аметист: фиолетовый самоцвет, холодит на ощупь.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.025 },
      icon: "assets/sprites/loot/amethyst.svg",
    },
    // 000062.json
    {
      id: "diamond",
      name: "Алмаз",
      kind: "reagent",
      weight: 0.05,
      value: 100,
      tier: 4,
      desc: "Алмаз: бесцветный самоцвет, самый твёрдый из камней.",
      loot: { terrains: ["песок"], near_mountains: true, frequency: 0.005 },
      icon: "assets/sprites/loot/diamond.svg",
    },
    // 000063.json
    {
      id: "berry_red",
      name: "Клубника",
      kind: "reagent",
      weight: 0.05,
      value: 2,
      desc: "Клубника: сладкая, с терпким привкусом лесной земли.",
      loot: { terrains: ["трава", "болото", "лес"], frequency: 0.04 },
      icon: "assets/sprites/loot/berry_red.svg",
    },
    // 000064.json
    {
      id: "berry_blue",
      name: "Черника",
      kind: "reagent",
      weight: 0.05,
      value: 3,
      desc: "Черника: тёмная, кисловатая, хороша в варенье и в зельях.",
      loot: { terrains: ["болото", "лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/berry_blue.svg",
    },
    // 000065.json
    {
      id: "berry_wild",
      name: "Дикая ягода",
      kind: "reagent",
      weight: 0.05,
      value: 2,
      desc: "Дикая ягода: мелкая и терпкая, растёт где ни попади.",
      loot: { terrains: ["трава", "лес"] },
      icon: "assets/sprites/loot/berry_wild.svg",
    },
    // 000066.json
    {
      id: "herb_sun",
      name: "Солнечная трава",
      kind: "reagent",
      weight: 0.1,
      value: 4,
      desc: "Солнечная трава: соцветие ловит свет и держит его до вечера.",
      loot: { terrains: ["трава", "лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/herb_sun.svg",
    },
    // 000067.json
    {
      id: "herb_wind",
      name: "Ветряная трава",
      kind: "reagent",
      weight: 0.1,
      value: 4,
      desc: "Ветряная трава: шелестит на ветру, как шёпот дальней дороги.",
      loot: { terrains: ["трава", "болото", "лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/herb_wind.svg",
    },
    // 000068.json
    {
      id: "root_moon",
      name: "Лунный корень",
      kind: "reagent",
      weight: 0.2,
      value: 6,
      desc: "Лунный корень: серебристый внутри, мерцает в сумерках.",
      loot: { terrains: ["лес", "болото"], frequency: 0.02 },
      icon: "assets/sprites/loot/root_moon.svg",
    },
    // 000069.json
    {
      id: "root_ember",
      name: "Огненный корень",
      kind: "reagent",
      weight: 0.2,
      value: 5,
      desc: "Огненный корень: тёмно-красный, на срезе тёплый, как уголь.",
      loot: { terrains: ["трава", "лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/root_ember.svg",
    },
    // 000070.json
    {
      id: "root_rock",
      name: "Каменный корень",
      kind: "reagent",
      weight: 0.3,
      value: 4,
      desc: "Каменный корень: твёрдый, с песчаными вкраплениями, ногтем не сломаешь.",
      loot: { terrains: ["трава", "болото"], frequency: 0.03 },
      icon: "assets/sprites/loot/root_rock.svg",
    },
    // 000071.json
    {
      id: "fruit_apple",
      name: "Яблоко",
      kind: "reagent",
      weight: 0.1,
      value: 2,
      desc: "Яблоко: кислое, с дерева у старой дороги.",
      loot: { terrains: ["трава", "лес"], frequency: 0.04 },
      icon: "assets/sprites/loot/fruit_apple.svg",
    },
    // 000072.json
    {
      id: "fruit_plum",
      name: "Слива",
      kind: "reagent",
      weight: 0.1,
      value: 3,
      desc: "Слива: тёмная, сочная, с тонкой светлой кожицей.",
      loot: { terrains: ["лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/fruit_plum.svg",
    },
    // 000073.json
    {
      id: "fruit_quince",
      name: "Айва",
      kind: "reagent",
      weight: 0.1,
      value: 4,
      desc: "Айва: ароматный терпкий плод, с острым привкусом.",
      loot: { terrains: ["трава", "лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/fruit_quince.svg",
    },
    // 000074.json
    {
      id: "mushroom_grey",
      name: "Рядовка",
      kind: "reagent",
      weight: 0.05,
      value: 2,
      desc: "Рядовка: серый шляпный гриб, тихий и сытный.",
      loot: { terrains: ["лес"], frequency: 0.04 },
      icon: "assets/sprites/loot/mushroom_grey.svg",
    },
    // 000075.json
    {
      id: "mushroom_glow",
      name: "Светящийся гриб",
      kind: "reagent",
      weight: 0.05,
      value: 4,
      desc: "Светящийся гриб: мягкий свет шляпки не гаснет даже ночью.",
      loot: { terrains: ["лес"], frequency: 0.02 },
      icon: "assets/sprites/loot/mushroom_glow.svg",
    },
    // 000076.json
    {
      id: "mushroom_ink",
      name: "Чернопряд",
      kind: "reagent",
      weight: 0.05,
      value: 3,
      desc: "Чернопряд: чёрный гриб, сочится чернильной жидкостью.",
      loot: { terrains: ["лес"], frequency: 0.03 },
      icon: "assets/sprites/loot/mushroom_ink.svg",
    },
  ];

  return { ITEMS };
});
