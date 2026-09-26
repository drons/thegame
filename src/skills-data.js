// Каталог навыков: униформный JS-модуль (фолбэк для file://).
//
// Source of truth — JSON-файлы каталога assets/skills/*.json
// (один навык — один файл, схема — assets/skills/schema.json).
// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-skills-data.js,
// не редактируйте вручную: правьте JSON и пересобирайте модуль.
//
// Униформный модуль: в браузере — globalThis.Game.SkillsData,
// в node — require() (CommonJS).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.SkillsData (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { SkillsData: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  // Основные навыки (assets/skills/000001.json … 000006.json).
  const PRIMARY_SKILLS = [
    // 000001.json
    {
      id: "strength",
      type: "primary",
      name: "Сила",
      desc: "Физическая мощь",
      combat: "Кол-во действий «Удар», урон в ближнем бою",
      world: "Переносимый вес, разрушение объектов",
    },
    // 000002.json
    {
      id: "dexterity",
      type: "primary",
      name: "Ловкость",
      desc: "Проворство, рефлексы и равновесие",
      combat: "Дистанция хода X клеток за ход, «Быстрые предметы»",
      world: "Скорость перемещения по карте",
    },
    // 000003.json
    {
      id: "constitution",
      type: "primary",
      name: "Телосложение",
      desc: "Здоровье и выносливость",
      combat: "«Постановка блока», макс. здоровье",
      world: "Здоровье в мирное время, сопротивление усталости",
    },
    // 000004.json
    {
      id: "intelligence",
      type: "primary",
      name: "Интеллект",
      desc: "Логика и память",
      combat: "Кол-во действий «Заклинание» (школа Интеллекта), урон заклинаниями этой школы",
      world: "Расшифровка записей, чтение карт и рунических текстов",
    },
    // 000005.json
    {
      id: "wisdom",
      type: "primary",
      name: "Мудрость",
      desc: "Восприимчивость и ментальная устойчивость",
      combat: "Кол-во действий «Заклинание» (школа Мудрости), сопротивление магическому влиянию",
      world: "Восстановление между днями, устойчивость к страху и проклятиям",
    },
    // 000006.json
    {
      id: "charisma",
      type: "primary",
      name: "Харизма",
      desc: "Уверенность, самообладание и обаяние",
      combat: "«Быстрые предметы» (часть), действия на мораль врагов",
      world: "Диалоги, цены торговли, лояльность спутников",
    },
  ];

  // Вторичные навыки (assets/skills/000007.json … 000037.json).
  // requires: null | { skill, level } — требование к другому навыку
  // (в JSON поле requires опущено, если требования нет).
  const SECONDARY_SKILLS = {
    // 000007.json
    swordsman: {
      id: "swordsman",
      type: "secondary",
      name: "Мечник",
      primary: "strength",
      requires: null,
      effect: { stat: "swordHitBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% вероятность попадания мечом за уровень",
      names: ["Начинающий мечник", "Ученик фехтовальщика", "Знаток клинка", "Мастер меча", "Гроссмейстер меча", "Легенда клинка"],
    },
    // 000008.json
    heavy: {
      id: "heavy",
      type: "secondary",
      name: "Тяжёлое оружие",
      primary: "strength",
      requires: { skill: "swordsman", level: 5 },
      effect: { stat: "heavyDamageBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% урон тяжёлым оружием за уровень",
      names: ["Сильная рука", "Ученик бойца с топором", "Знаток тяжёлого оружия", "Мастер топора", "Гроссмейстер топора", "Легенда великого топора"],
    },
    // 000009.json
    fists: {
      id: "fists",
      type: "secondary",
      name: "Каменные кулаки",
      primary: "strength",
      requires: null,
      effect: { stat: "fistDamageBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% урон голыми руками за уровень",
      names: ["Новичок кулака", "Ученик кулака", "Знаток босого боя", "Мастер кулака", "Гроссмейстер кулака", "Легенда несокрушимого кулака"],
    },
    // 000010.json
    forge: {
      id: "forge",
      type: "secondary",
      name: "Кузнечная рука",
      primary: "strength",
      requires: { skill: "strength", level: 5 },
      effect: { stat: "equipmentDurabilityMult", perLevel: 0.05 },
      effectType: "Карта",
      desc: "+5% прочность собственного снаряжения за уровень",
      names: ["Подмастерье-кузнец", "Ученик наковальни", "Знаток кузницы", "Мастер-кузнец", "Гроссмейстер кузницы", "Легенда молота"],
    },
    // 000011.json
    back: {
      id: "back",
      type: "secondary",
      name: "Крепкая спина",
      primary: "strength",
      requires: null,
      effect: { stat: "carryWeightMult", perLevel: 0.1 },
      effectType: "Карта",
      desc: "+10% к максимальному весу за уровень",
      names: ["Носильщик", "Ученик грузчика", "Знаток ноши", "Мастер ноши", "Гроссмейстер ноши", "Легенда крепкой спины"],
    },
    // 000012.json
    accuracy: {
      id: "accuracy",
      type: "secondary",
      name: "Меткость",
      primary: "dexterity",
      requires: null,
      effect: { stat: "rangedDamageBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% урон от оружия дальнего боя за уровень",
      names: ["Твёрдый глаз", "Ученик стрелка", "Знаток мишени", "Мастер меткости", "Гроссмейстер меткости", "Легенда стрелы"],
    },
    // 000013.json
    catseye: {
      id: "catseye",
      type: "secondary",
      name: "Кошачий глаз",
      primary: "dexterity",
      requires: null,
      effect: { stat: "caveVisionMult", perLevel: 0.1 },
      effectType: "Карта",
      desc: "+10% дистанция зрения в пещерах за уровень",
      names: ["Зоркий взгляд", "Ученик кошачьего глаза", "Знаток ночи", "Мастер ночи", "Гроссмейстер ночи", "Легенда взора"],
    },
    // 000014.json
    step: {
      id: "step",
      type: "secondary",
      name: "Ловкий шаг",
      primary: "dexterity",
      requires: null,
      effect: { stat: "moveSpeedMult", perLevel: 0.05 },
      effectType: "Карта",
      desc: "+5% скорость перемещения по карте за уровень",
      names: ["Лёгкая нога", "Ученик бегуна", "Знаток шага", "Мастер бегуна", "Гроссмейстер шага", "Легенда ветра"],
    },
    // 000015.json
    archer: {
      id: "archer",
      type: "secondary",
      name: "Стрелок",
      primary: "dexterity",
      requires: { skill: "accuracy", level: 5 },
      effect: { stat: "archerHitBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% вероятность попадания из лука за уровень",
      names: ["Юный лучник", "Ученик стрелка", "Знаток лука", "Мастер лучник", "Гроссмейстер лучник", "Легенда тетивы"],
    },
    // 000016.json
    acro: {
      id: "acro",
      type: "secondary",
      name: "Акробатика",
      primary: "dexterity",
      requires: { skill: "step", level: 5 },
      effect: { stat: "acroBonus", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "+5% шанс избежать падения, лазание за уровень",
      names: ["Прыгун", "Ученик акробата", "Знаток прыжка", "Мастер акробата", "Гроссмейстер акробата", "Легенда прыжка"],
    },
    // 000017.json
    thief: {
      id: "thief",
      type: "secondary",
      name: "Тать",
      primary: "dexterity",
      requires: { skill: "dexterity", level: 5 },
      effect: { stat: "thiefBonus", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "Открывание замков, снятие ловушек, кража: +5% за уровень",
      names: ["Шалун", "Ученик вора", "Знаток замков", "Мастер воровства", "Гроссмейстер теней", "Легенда теней"],
    },
    // 000018.json
    hide: {
      id: "hide",
      type: "secondary",
      name: "Железная кожа",
      primary: "constitution",
      requires: null,
      effect: { stat: "damageTakenMult", perLevel: -0.05 },
      effectType: "Бой",
      desc: "-5% получаемый урон за уровень",
      names: ["Толстая шкура", "Ученик шкуры", "Знаток железа", "Мастер железа", "Гроссмейстер железа", "Легенда несокрушимого"],
    },
    // 000019.json
    endurance: {
      id: "endurance",
      type: "secondary",
      name: "Выносливость",
      primary: "constitution",
      requires: null,
      effect: { stat: "maxHPMult", perLevel: 0.03 },
      effectType: "Бой/Карта",
      desc: "+3% к максимальному здоровью за уровень",
      names: ["Устойчивое дыхание", "Ученик выносливого", "Знаток выносливости", "Мастер выносливости", "Гроссмейстер выносливости", "Легенда горы"],
    },
    // 000020.json
    golem: {
      id: "golem",
      type: "secondary",
      name: "Голем",
      primary: "constitution",
      requires: { skill: "hide", level: 5 },
      effect: { stat: "maxHPMult", perLevel: 0.02 },
      effectType: "Бой/Карта",
      desc: "+2% макс. здоровье и +1 броня за уровень",
      names: ["Каменное сердце", "Ученик голема", "Знаток гранита", "Мастер голема", "Гроссмейстер голема", "Легенда истукана"],
    },
    // 000021.json
    breath: {
      id: "breath",
      type: "secondary",
      name: "Глубокий вдох",
      primary: "constitution",
      requires: { skill: "constitution", level: 5 },
      effect: { stat: "hpRegenMult", perLevel: 0.05 },
      effectType: "Карта",
      desc: "+5% к восстановлению здоровья между днями за уровень",
      names: ["Глубокий вдох", "Ученик лёгких", "Знаток дыхания", "Мастер дыхания", "Гроссмейстер дыхания", "Легенда кита"],
    },
    // 000022.json
    unkill: {
      id: "unkill",
      type: "secondary",
      name: "Несокрушимость",
      primary: "constitution",
      requires: { skill: "golem", level: 10 },
      effect: { stat: "survivalChance", perLevel: 0.01 },
      effectType: "Бой",
      desc: "1% за уровень шанс выжить смертельный удар (1 раз в день)",
      names: ["Упрямство", "Ученик выживальщика", "Знаток второго шанса", "Мастер выживший", "Гроссмейстер выживший", "Легенда презрения к смерти"],
    },
    // 000023.json
    firelord: {
      id: "firelord",
      type: "secondary",
      name: "Повелитель огня",
      primary: "intelligence",
      requires: null,
      effect: { stat: "fireDamageBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% урон огненными заклинаниями за уровень",
      names: ["Искра огня", "Ученик пироманта", "Знаток пламени", "Повелитель огня", "Гроссмейстер пламени", "Легенда солнца"],
    },
    // 000024.json
    icelord: {
      id: "icelord",
      type: "secondary",
      name: "Повелитель льда",
      primary: "intelligence",
      requires: { skill: "firelord", level: 5 },
      effect: { stat: "iceDamageBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% урон заклинаниями льда за уровень",
      names: ["Ледяной осколок", "Ученик криоманта", "Знаток стужи", "Повелитель льда", "Гроссмейстер стужи", "Легенда полярного сияния"],
    },
    // 000025.json
    alchemy: {
      id: "alchemy",
      type: "secondary",
      name: "Алхимик",
      primary: "intelligence",
      requires: null,
      effect: { stat: "potionPowerMult", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "+5% сила зелий и снадобий за уровень",
      names: ["Любопытный нос", "Ученик алхимика", "Знаток зелий", "Мастер-алхимик", "Гроссмейстер алхимии", "Легенда философа"],
    },
    // 000026.json
    scholar: {
      id: "scholar",
      type: "secondary",
      name: "Учёный",
      primary: "intelligence",
      requires: null,
      effect: { stat: "xpMult", perLevel: 0.02 },
      effectType: "Карта",
      desc: "+2% к получаемому опыту за уровень",
      names: ["Книголюб", "Ученик писца", "Знаток знаний", "Мастер учёный", "Гроссмейстер учёный", "Легенда архивов"],
    },
    // 000027.json
    runes: {
      id: "runes",
      type: "secondary",
      name: "Рунопись",
      primary: "intelligence",
      requires: { skill: "intelligence", level: 5 },
      effect: { stat: "runePowerMult", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "+5% сила рунических эффектов за уровень",
      names: ["Чтец рун", "Ученик рунописца", "Знаток начертания", "Мастер рунописец", "Гроссмейстер рунописца", "Легенда руны"],
    },
    // 000028.json
    perception: {
      id: "perception",
      type: "secondary",
      name: "Зоркость",
      primary: "wisdom",
      requires: null,
      effect: { stat: "magicResistMult", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% сопротивление всем школам магии за уровень",
      names: ["Чутьё", "Ученик завесы", "Знаток защиты", "Мастер защиты", "Гроссмейстер защиты", "Легенда непоколебимого"],
    },
    // 000029.json
    meditation: {
      id: "meditation",
      type: "secondary",
      name: "Медитация",
      primary: "wisdom",
      requires: null,
      effect: { stat: "mpRegenMult", perLevel: 0.02 },
      effectType: "Карта",
      desc: "+2% к восстановлению здоровья и маны между днями за уровень",
      names: ["Тихая мысль", "Ученик медитатора", "Знаток тишины", "Мастер тишины", "Гроссмейстер тишины", "Легенда безмолвного ума"],
    },
    // 000030.json
    precog: {
      id: "precog",
      type: "secondary",
      name: "Ясновидение",
      primary: "wisdom",
      requires: { skill: "perception", level: 5 },
      effect: { stat: "dodgeBonus", perLevel: 0.05 },
      effectType: "Бой",
      desc: "+5% шанс уклонения за уровень",
      names: ["Предчувствие", "Ученик ясновидца", "Знаток видения", "Мастер ясновидец", "Гроссмейстер ясновидца", "Легенда будущего"],
    },
    // 000031.json
    nature: {
      id: "nature",
      type: "secondary",
      name: "Сердце природы",
      primary: "wisdom",
      requires: { skill: "wisdom", level: 5 },
      effect: { stat: "foodPowerMult", perLevel: 0.05 },
      effectType: "Карта",
      desc: "+5% сила зелий и еды за уровень",
      names: ["Сборник трав", "Ученик луга", "Знаток рощи", "Мастер рощи", "Гроссмейстер рощи", "Легенда мира-дерева"],
    },
    // 000032.json
    elder: {
      id: "elder",
      type: "secondary",
      name: "Старейшина",
      primary: "wisdom",
      requires: null,
      effect: { stat: "dialogueBonus", perLevel: 1 },
      effectType: "Карта",
      desc: "+1 к проверкам в диалогах за уровень",
      names: ["Задавака", "Ученик слушателя", "Знаток слова", "Мастер слова", "Гроссмейстер слова", "Легенда мудрости"],
    },
    // 000033.json
    merchant: {
      id: "merchant",
      type: "secondary",
      name: "Торговец",
      primary: "charisma",
      requires: null,
      effect: { stat: "buyPriceMult", perLevel: -0.05 },
      effectType: "Карта",
      desc: "-5% цены покупки, +5% цены продажи за уровень",
      names: ["Торгошина", "Ученик купца", "Знаток сделки", "Мастер-торговец", "Гроссмейстер торговли", "Легенда весов"],
    },
    // 000034.json
    orator: {
      id: "orator",
      type: "secondary",
      name: "Оратор",
      primary: "charisma",
      requires: null,
      effect: { stat: "dialogueBonus", perLevel: 1 },
      effectType: "Карта",
      desc: "Открывает дополнительные опции в диалогах",
      names: ["Болтун", "Ученик оратора", "Знаток речи", "Мастер оратор", "Гроссмейстер оратор", "Легенда форума"],
    },
    // 000035.json
    leader: {
      id: "leader",
      type: "secondary",
      name: "Предводитель",
      primary: "charisma",
      requires: { skill: "orator", level: 5 },
      effect: { stat: "companionMoraleBonus", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "+5% мораль спутников за уровень",
      names: ["Бунтарь", "Ученик вожатого", "Знаток знамени", "Мастер вожак", "Гроссмейстер вожак", "Легенда стяга"],
    },
    // 000036.json
    artist: {
      id: "artist",
      type: "secondary",
      name: "Артист",
      primary: "charisma",
      requires: null,
      effect: { stat: "performanceIncomeMult", perLevel: 0.1 },
      effectType: "Бой/Карта",
      desc: "+10% заработок на выступлениях за уровень",
      names: ["Сказитель", "Ученик исполнителя", "Знаток сцены", "Мастер-артист", "Гроссмейстер артист", "Легенда песни"],
    },
    // 000037.json
    fright: {
      id: "fright",
      type: "secondary",
      name: "Застращивание",
      primary: "charisma",
      requires: { skill: "charisma", level: 5 },
      effect: { stat: "fearChance", perLevel: 0.05 },
      effectType: "Бой/Карта",
      desc: "5% за уровень шанс напугать моба уровнем ниже",
      names: ["Взгляд", "Ученик запугателя", "Знаток тени", "Мастер страха", "Гроссмейстер страха", "Легенда устрашения"],
    },
  };

  return { PRIMARY_SKILLS, SECONDARY_SKILLS };
});
