// Каталог предметов: фолбэк-копия assets/items/*.json.
// Под file:// браузер не может fetch() локальных JSON, поэтому каталог
// продублирован в униформном JS-модуле. Source of truth — JSON-файлы
// assets/items (структура — assets/items/schema.json); консистентность
// JS-модуля с JSON проверяют тесты (tests/items.test.js).
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Один предмет — одна запись; порядок = порядок файлов assets/items.
  const ITEMS = [
    {
      "id": "wood_sword",
      "name": "Деревянный меч",
      "kind": "weapon",
      "subtype": "sword",
      "weight": 1,
      "value": 10,
      "desc": "Простой деревянный меч: лёгкий, крепкий, не подводит.",
      "stats": {
        "damage": 3
      }
    },
    {
      "id": "iron_sword",
      "name": "Железный меч",
      "kind": "weapon",
      "subtype": "sword",
      "weight": 1.5,
      "value": 40,
      "desc": "Честный железный меч из пограничной кузницы.",
      "stats": {
        "damage": 5
      }
    },
    {
      "id": "steel_sword",
      "name": "Стальной меч",
      "kind": "weapon",
      "subtype": "sword",
      "weight": 2,
      "value": 120,
      "desc": "Стальной меч, отполированный в рыцарской кузнице.",
      "stats": {
        "damage": 7
      }
    },
    {
      "id": "short_bow",
      "name": "Короткий лук",
      "kind": "weapon",
      "subtype": "bow",
      "weight": 1,
      "value": 30,
      "desc": "Короткий охотничий лук: надёжен на близкой дистанции.",
      "stats": {
        "damage": 4
      }
    },
    {
      "id": "hunting_bow",
      "name": "Охотничий лук",
      "kind": "weapon",
      "subtype": "bow",
      "weight": 1.5,
      "value": 90,
      "desc": "Лук охотника — стрела летит далеко и точно.",
      "stats": {
        "damage": 6
      }
    },
    {
      "id": "battle_axe",
      "name": "Боевой топор",
      "kind": "weapon",
      "subtype": "heavy",
      "weight": 3,
      "value": 150,
      "desc": "Боевой топор: один удар — и щит трескается.",
      "stats": {
        "damage": 8
      }
    },
    {
      "id": "war_hammer",
      "name": "Боевой молот",
      "kind": "weapon",
      "subtype": "heavy",
      "weight": 4,
      "value": 250,
      "desc": "Боевой молот: вес и верный удар.",
      "stats": {
        "damage": 10
      }
    },
    {
      "id": "leather_armor",
      "name": "Кожаный доспех",
      "kind": "armor",
      "weight": 2,
      "value": 35,
      "desc": "Мягкий кожаный доспех: защита без скрипа.",
      "stats": {
        "armor": 2
      }
    },
    {
      "id": "chainmail",
      "name": "Кольчуга",
      "kind": "armor",
      "weight": 4,
      "value": 140,
      "desc": "Кольчуга: кольца, вплетённые мастерской рукой.",
      "stats": {
        "armor": 4
      }
    },
    {
      "id": "knight_plate",
      "name": "Рыцарский доспех",
      "kind": "armor",
      "weight": 7,
      "value": 400,
      "desc": "Рыцарский латы: как ходячая крепость.",
      "stats": {
        "armor": 6
      }
    },
    {
      "id": "minor_healing",
      "name": "Малое зелье лечения",
      "kind": "potion",
      "weight": 0.3,
      "value": 4,
      "desc": "Малое зелье лечения: раны затягиваются, сердце успокаивается.",
      "effect": {
        "kind": "heal",
        "amount": 6
      }
    },
    {
      "id": "healing_potion",
      "name": "Зелье лечения",
      "kind": "potion",
      "weight": 0.5,
      "value": 10,
      "desc": "Зелье лечения: красное, тёплое, пахнет клевером.",
      "effect": {
        "kind": "heal",
        "amount": 15
      }
    },
    {
      "id": "greater_healing",
      "name": "Большое зелье лечения",
      "kind": "potion",
      "weight": 0.5,
      "value": 35,
      "desc": "Большое зелье лечения: как будто целитель положил ладони.",
      "effect": {
        "kind": "heal",
        "amount": 40
      }
    },
    {
      "id": "mana_potion",
      "name": "Зелье маны",
      "kind": "potion",
      "weight": 0.5,
      "value": 12,
      "desc": "Зелье маны: голубая искра за глазами.",
      "effect": {
        "kind": "mp",
        "amount": 10
      }
    },
    {
      "id": "mana_elixir",
      "name": "Эликсир маны",
      "kind": "potion",
      "weight": 0.5,
      "value": 40,
      "desc": "Эликсир маны: ум проясняется, руны горят ярче.",
      "effect": {
        "kind": "mp",
        "amount": 20
      }
    },
    {
      "id": "bread",
      "name": "Хлеб",
      "kind": "food",
      "weight": 0.2,
      "value": 2,
      "desc": "Свежий хлеб: лучшее лекарство в дороге.",
      "effect": {
        "kind": "eat",
        "amount": 4
      }
    },
    {
      "id": "meat",
      "name": "Жареное мясо",
      "kind": "food",
      "weight": 0.4,
      "value": 5,
      "desc": "Жареное мясо с травами: силы для долгого перехода.",
      "effect": {
        "kind": "eat",
        "amount": 8
      }
    },
    {
      "id": "honey_cake",
      "name": "Медовый пирог",
      "kind": "food",
      "weight": 0.3,
      "value": 8,
      "desc": "Медовый пирог: немного сладкого — и день становится добрее.",
      "effect": {
        "kind": "eat",
        "amount": 6
      }
    },
    {
      "id": "alchemy_manual",
      "name": "Трактат алхимика",
      "kind": "skill_book",
      "weight": 0.5,
      "value": 50,
      "desc": "Практический трактат алхимика: рецепты и предостережения.",
      "effect": {
        "kind": "skill_xp",
        "skill": "alchemy",
        "amount": 10
      }
    },
    {
      "id": "sword_treatise",
      "name": "Учение о мечах",
      "kind": "skill_book",
      "weight": 0.5,
      "value": 60,
      "desc": "Учение о мечах: от основ до цветка удара.",
      "effect": {
        "kind": "skill_xp",
        "skill": "swordsman",
        "amount": 10
      }
    },
    {
      "id": "archery_manual",
      "name": "Азбука стрельбы",
      "kind": "skill_book",
      "weight": 0.5,
      "value": 60,
      "desc": "Азбука стрельбы: ветер, дыхание и отпускание.",
      "effect": {
        "kind": "skill_xp",
        "skill": "accuracy",
        "amount": 10
      }
    },
    {
      "id": "sulfur",
      "name": "Сера",
      "kind": "reagent",
      "weight": 0.2,
      "value": 3,
      "desc": "Сера: пахнет нехорошо, зато в алхимике дорога."
    },
    {
      "id": "moonstone",
      "name": "Лунный камень",
      "kind": "reagent",
      "weight": 0.1,
      "value": 25,
      "desc": "Лунный камень: слегка светится в темноте."
    },
    {
      "id": "phoenix_feather",
      "name": "Перо феникса",
      "kind": "reagent",
      "weight": 0.05,
      "value": 150,
      "desc": "Перо феникса: тёплое на ощупь, редкая находка."
    },
    {
      "id": "stone_fist_grimoire",
      "name": "Гримуар каменных кулаков",
      "kind": "skill_book",
      "weight": 0.4,
      "value": 55,
      "desc": "Гримуар каменных кулаков: техника удара, когда металл не при чём.",
      "effect": {
        "kind": "skill_xp",
        "skill": "fists",
        "amount": 25
      }
    },
    {
      "id": "iron_hide_tome",
      "name": "Учение о железной коже",
      "kind": "skill_book",
      "weight": 0.4,
      "value": 55,
      "desc": "Учение о железной коже: как принимать удар и не вспоминать о нём.",
      "effect": {
        "kind": "skill_xp",
        "skill": "hide",
        "amount": 25
      }
    },
    {
      "id": "fire_spellbook",
      "name": "Книга огненных заклинаний",
      "kind": "skill_book",
      "weight": 0.5,
      "value": 60,
      "desc": "Огненные заклинания: от искры до пламени, что ест камень.",
      "effect": {
        "kind": "skill_xp",
        "skill": "firelord",
        "amount": 25
      }
    },
    {
      "id": "ice_spellbook",
      "name": "Книга ледяных заклинаний",
      "kind": "skill_book",
      "weight": 0.5,
      "value": 60,
      "desc": "Ледяные заклинания: стужа, что останавливает кровь в жилах.",
      "effect": {
        "kind": "skill_xp",
        "skill": "icelord",
        "amount": 25
      }
    },
    {
      "id": "heavy_tome",
      "name": "Том великого топора",
      "kind": "skill_book",
      "weight": 0.6,
      "value": 70,
      "desc": "Тяжёлое оружие: вес, инерция и терпение.",
      "effect": {
        "kind": "skill_xp",
        "skill": "heavy",
        "amount": 30
      }
    },
    {
      "id": "archer_scroll",
      "name": "Свиток лучника",
      "kind": "skill_book",
      "weight": 0.2,
      "value": 45,
      "desc": "Свиток лучника: дыхание, прицел, отпускание.",
      "effect": {
        "kind": "skill_xp",
        "skill": "archer",
        "amount": 15
      }
    },
    {
      "id": "meditation_scroll",
      "name": "Свиток медитации",
      "kind": "skill_book",
      "weight": 0.2,
      "value": 40,
      "desc": "Свиток медитации: тишина, в которой ману слышно ушами.",
      "effect": {
        "kind": "skill_xp",
        "skill": "meditation",
        "amount": 15
      }
    },
    {
      "id": "nature_scroll",
      "name": "Свиток сердца природы",
      "kind": "skill_book",
      "weight": 0.2,
      "value": 40,
      "desc": "Свиток сердца природы: травы, их вкусы и тайны.",
      "effect": {
        "kind": "skill_xp",
        "skill": "nature",
        "amount": 15
      }
    }
  ];

  return { ITEMS };
});
