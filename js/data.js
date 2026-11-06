/**
 * 这顿 · 灵感库
 *
 * 数据刻意保持“少而具体”：这不是一个餐厅点评目录，而是一组
 * 可以直接拿来做决定的饭局原型。每个选项都有价格、步行时间、
 * 排队预期和口味标签，供本地决策引擎打分。
 */

export const TONES = {
  tomato: { bg: '#D94E35', fg: '#FFF7E8', ink: '#B6402A', name: '番茄红' },
  mustard: { bg: '#E7B04A', fg: '#2A2115', ink: '#875711', name: '芥末黄' },
  olive: { bg: '#687550', fg: '#FFF8E9', ink: '#4B5738', name: '橄榄绿' },
  blue: { bg: '#385A66', fg: '#F8F0DF', ink: '#294650', name: '夜航蓝' },
  plum: { bg: '#7A4B49', fg: '#FFF6E7', ink: '#5B3634', name: '梅子褐' },
  cream: { bg: '#EFE1C0', fg: '#2A2115', ink: '#80551D', name: '米纸白' },
  charcoal: { bg: '#332E26', fg: '#FFF6E7', ink: '#2A251E', name: '炭火黑' }
};

export const TONE_KEYS = Object.keys(TONES);

export const MEALS = {
  breakfast: { label: '早餐', en: 'BREAKFAST' },
  lunch: { label: '午餐', en: 'LUNCH' },
  tea: { label: '下午茶', en: 'AFTERNOON' },
  dinner: { label: '晚餐', en: 'DINNER' },
  late: { label: '夜宵', en: 'LATE NIGHT' }
};

export const BUDGETS = [
  { value: 30, label: '¥30 内' },
  { value: 60, label: '¥60 内' },
  { value: 100, label: '¥100 内' },
  { value: 999, label: '不限' }
];

export const DISTANCES = [
  { value: 5, label: '楼下' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '不设限' }
];

export const PEOPLE = [
  { value: 1, label: '1 人' },
  { value: 2, label: '2 人' },
  { value: 4, label: '3–4 人' },
  { value: 8, label: '一群人' }
];

export const MOODS = [
  { value: 'warm', label: '热乎的' },
  { value: 'light', label: '清爽的' },
  { value: 'spicy', label: '重口的' },
  { value: 'any', label: '都行' }
];

export const OPTIONS = [
  {
    id: 'beef-noodle',
    name: '兰州牛肉面',
    mark: '面',
    tone: 'tomato',
    cuisine: '西北',
    price: 32,
    distance: 8,
    queue: 5,
    meals: ['lunch', 'dinner'],
    tags: ['warm', 'soup', 'noodle', 'fast', 'solo', 'meaty', 'comfort'],
    desc: '清汤、白萝卜、红油、绿蒜苗。十分钟吃完，连汤都喝干净。',
    mapQuery: '兰州牛肉面'
  },
  {
    id: 'malatang',
    name: '麻辣烫',
    mark: '烫',
    tone: 'mustard',
    cuisine: '川渝',
    price: 38,
    distance: 5,
    queue: 8,
    meals: ['lunch', 'dinner', 'late'],
    tags: ['spicy', 'warm', 'fast', 'solo', 'veg', 'comfort'],
    desc: '自己夹菜，自己负责。微辣，是留给犹豫的人的台阶。',
    mapQuery: '麻辣烫'
  },
  {
    id: 'chaoshan-hotpot',
    name: '潮汕牛肉火锅',
    mark: '锅',
    tone: 'olive',
    cuisine: '潮汕',
    price: 98,
    distance: 15,
    queue: 15,
    meals: ['dinner'],
    tags: ['warm', 'meaty', 'share', 'group', 'slow', 'comfort'],
    groupOnly: true,
    desc: '清汤锅底，现切吊龙。适合把这一周没说完的话慢慢说完。',
    mapQuery: '潮汕牛肉火锅'
  },
  {
    id: 'curry-rice',
    name: '日式咖喱饭',
    mark: '咖',
    tone: 'cream',
    cuisine: '日式',
    price: 46,
    distance: 10,
    queue: 6,
    meals: ['lunch', 'dinner'],
    tags: ['warm', 'rice', 'mild', 'solo', 'fast', 'comfort'],
    desc: '浓稠、温和、几乎不会出错。加一块炸猪排，今天就算过得不错。',
    mapQuery: '日式咖喱饭'
  },
  {
    id: 'tom-yum',
    name: '泰式冬阴功',
    mark: '泰',
    tone: 'blue',
    cuisine: '泰式',
    price: 68,
    distance: 18,
    queue: 10,
    meals: ['lunch', 'dinner'],
    tags: ['spicy', 'soup', 'share', 'group', 'fish'],
    desc: '酸辣醒神。适合不想再吃常规工作餐的那一天。',
    mapQuery: '泰式冬阴功'
  },
  {
    id: 'roast-meat',
    name: '广式烧腊双拼',
    mark: '烧',
    tone: 'plum',
    cuisine: '粤式',
    price: 42,
    distance: 9,
    queue: 7,
    meals: ['lunch', 'dinner'],
    tags: ['meaty', 'rice', 'fast', 'solo', 'comfort'],
    desc: '叉烧拼烧鸭，酱汁拌饭。效率和满足感，可以同时成立。',
    mapQuery: '广式烧腊'
  },
  {
    id: 'sauerkraut-fish',
    name: '酸菜鱼',
    mark: '鱼',
    tone: 'tomato',
    cuisine: '川渝',
    price: 72,
    distance: 16,
    queue: 12,
    meals: ['lunch', 'dinner'],
    tags: ['spicy', 'meaty', 'share', 'group', 'warm', 'fish'],
    groupOnly: true,
    desc: '一锅端上桌，酸辣开胃。三四人分食，刚好。',
    mapQuery: '酸菜鱼'
  },
  {
    id: 'hainanese-chicken',
    name: '海南鸡饭',
    mark: '鸡',
    tone: 'cream',
    cuisine: '南洋',
    price: 45,
    distance: 12,
    queue: 8,
    meals: ['lunch', 'dinner'],
    tags: ['light', 'rice', 'meaty', 'solo', 'comfort'],
    desc: '鸡肉嫩，鸡油饭香，三款酱各有脾气。清爽，但不寡淡。',
    mapQuery: '海南鸡饭'
  },
  {
    id: 'pho',
    name: '越南河粉',
    mark: '粉',
    tone: 'olive',
    cuisine: '越南',
    price: 48,
    distance: 14,
    queue: 6,
    meals: ['lunch', 'dinner'],
    tags: ['warm', 'soup', 'light', 'solo', 'comfort'],
    desc: '牛骨汤清亮，挤半颗青柠。胃和心情一起松开。',
    mapQuery: '越南河粉'
  },
  {
    id: 'luosifen',
    name: '螺蛳粉',
    mark: '螺',
    tone: 'charcoal',
    cuisine: '柳州',
    price: 28,
    distance: 6,
    queue: 4,
    meals: ['lunch', 'dinner', 'late'],
    tags: ['spicy', 'strong', 'noodle', 'solo', 'fast'],
    desc: '闻着犹豫，吃着诚实。建议独自享用，尊重彼此。',
    mapQuery: '螺蛳粉'
  },
  {
    id: 'bibimbap',
    name: '韩式拌饭',
    mark: '拌',
    tone: 'mustard',
    cuisine: '韩式',
    price: 52,
    distance: 13,
    queue: 8,
    meals: ['lunch', 'dinner'],
    tags: ['veg', 'rice', 'mild', 'solo', 'healthy'],
    desc: '把颜色拌在一起，锅巴是隐藏奖励。吃完不困。',
    mapQuery: '韩式拌饭'
  },
  {
    id: 'xinjiang-noodle',
    name: '新疆炒米粉',
    mark: '炒',
    tone: 'tomato',
    cuisine: '新疆',
    price: 36,
    distance: 11,
    queue: 6,
    meals: ['lunch', 'dinner'],
    tags: ['spicy', 'noodle', 'fast', 'solo', 'meaty'],
    desc: '酱汁裹满每一根米粉。辣度建议从微辣开始，别逞强。',
    mapQuery: '新疆炒米粉'
  },
  {
    id: 'taco',
    name: '墨西哥卷饼',
    mark: '卷',
    tone: 'mustard',
    cuisine: '墨西哥',
    price: 44,
    distance: 10,
    queue: 5,
    meals: ['lunch', 'dinner'],
    tags: ['handheld', 'meaty', 'fast', 'solo', 'cheesy'],
    desc: '一手掌握，边走边吃也不狼狈。酱多酱少，这次你说了算。',
    mapQuery: '墨西哥卷饼'
  },
  {
    id: 'pizza',
    name: '那不勒斯披萨',
    mark: '披',
    tone: 'tomato',
    cuisine: '意式',
    price: 88,
    distance: 20,
    queue: 10,
    meals: ['dinner', 'late'],
    tags: ['share', 'group', 'cheesy', 'baked', 'comfort'],
    desc: '边缘带豹纹斑点的那种。适合人多，也适合找个加班的借口。',
    mapQuery: '那不勒斯披萨'
  },
  {
    id: 'xiaolongbao',
    name: '小笼包 + 豆浆',
    mark: '包',
    tone: 'cream',
    cuisine: '江南',
    price: 26,
    distance: 4,
    queue: 6,
    meals: ['breakfast', 'lunch'],
    tags: ['warm', 'fast', 'solo', 'meaty', 'breakfast', 'comfort'],
    desc: '先开窗，后喝汤。早餐的仪式感，五分钟就能完成。',
    mapQuery: '小笼包'
  },
  {
    id: 'salad',
    name: '沙拉能量碗',
    mark: '沙',
    tone: 'olive',
    cuisine: '轻食',
    price: 42,
    distance: 8,
    queue: 3,
    meals: ['lunch', 'dinner'],
    tags: ['light', 'veg', 'healthy', 'fast', 'solo'],
    desc: '南瓜、羽衣甘蓝、溏心蛋。吃完不困，是下午的底气。',
    mapQuery: '沙拉能量碗'
  },
  {
    id: 'bbq',
    name: '炭火烧烤',
    mark: '烤',
    tone: 'charcoal',
    cuisine: '烧烤',
    price: 78,
    distance: 18,
    queue: 20,
    meals: ['dinner', 'late'],
    tags: ['group', 'meaty', 'share', 'grill', 'comfort'],
    groupOnly: true,
    desc: '肉串、蒜蓉茄子、冰啤酒。适合把决定拖到最后一刻。',
    mapQuery: '炭火烧烤'
  },
  {
    id: 'sushi',
    name: '寿司拼盘',
    mark: '寿',
    tone: 'blue',
    cuisine: '日式',
    price: 76,
    distance: 15,
    queue: 10,
    meals: ['lunch', 'dinner'],
    tags: ['light', 'fish', 'group', 'share', 'solo', 'healthy'],
    desc: '不用点菜，拼盘解决一切。芥末请量力而行。',
    mapQuery: '寿司'
  },
  {
    id: 'sichuan',
    name: '川味小炒',
    mark: '川',
    tone: 'plum',
    cuisine: '川渝',
    price: 56,
    distance: 12,
    queue: 10,
    meals: ['lunch', 'dinner'],
    tags: ['spicy', 'meaty', 'group', 'share', 'rice', 'comfort'],
    desc: '锅气足，下饭快。两荤一素，刚好一桌。',
    mapQuery: '川菜馆'
  },
  {
    id: 'yunnan-rice-noodle',
    name: '云南米线',
    mark: '线',
    tone: 'olive',
    cuisine: '云南',
    price: 34,
    distance: 9,
    queue: 4,
    meals: ['breakfast', 'lunch', 'dinner'],
    tags: ['warm', 'soup', 'noodle', 'solo', 'fast', 'comfort'],
    desc: '汤头滚烫，配菜自己下。从胃暖到手，只要十分钟。',
    mapQuery: '云南米线'
  },
  {
    id: 'congee',
    name: '粥 + 小菜',
    mark: '粥',
    tone: 'cream',
    cuisine: '家常',
    price: 22,
    distance: 4,
    queue: 2,
    meals: ['breakfast', 'late'],
    tags: ['gentle', 'light', 'breakfast', 'late', 'solo', 'comfort'],
    desc: '皮蛋瘦肉粥配一碟咸菜。胃不舒服时的标准答案。',
    mapQuery: '粥店'
  },
  {
    id: 'dumplings',
    name: '东北饺子',
    mark: '饺',
    tone: 'mustard',
    cuisine: '东北',
    price: 38,
    distance: 10,
    queue: 8,
    meals: ['lunch', 'dinner', 'late'],
    tags: ['warm', 'group', 'share', 'meaty', 'solo', 'comfort'],
    desc: '一盘猪肉白菜，一盘韭菜鸡蛋。人多就再点两盘。',
    mapQuery: '东北饺子'
  },
  {
    id: 'hk-cafe',
    name: '港式茶餐厅',
    mark: '茶',
    tone: 'blue',
    cuisine: '港式',
    price: 50,
    distance: 11,
    queue: 7,
    meals: ['lunch', 'dinner', 'late'],
    tags: ['all-day', 'group', 'rice', 'meaty', 'fast', 'comfort'],
    desc: '碟头饭、冻柠茶、菠萝油。任何时间都不会出错。',
    mapQuery: '港式茶餐厅'
  },
  {
    id: 'sandwich',
    name: '轻食三明治',
    mark: '治',
    tone: 'cream',
    cuisine: '轻食',
    price: 28,
    distance: 3,
    queue: 2,
    meals: ['breakfast', 'lunch'],
    tags: ['light', 'fast', 'solo', 'handheld', 'healthy'],
    desc: '全麦面包夹鸡胸。适合边回消息边解决的一顿。',
    mapQuery: '三明治'
  },
  {
    id: 'chongqing-noodle',
    name: '重庆小面',
    mark: '小',
    tone: 'tomato',
    cuisine: '川渝',
    price: 24,
    distance: 5,
    queue: 4,
    meals: ['breakfast', 'lunch'],
    tags: ['spicy', 'noodle', 'fast', 'solo', 'comfort'],
    desc: '二两小面，多青。辣得清醒，便宜得安心。',
    mapQuery: '重庆小面'
  },
  {
    id: 'teppanyaki',
    name: '铁板烧',
    mark: '铁',
    tone: 'charcoal',
    cuisine: '日式',
    price: 108,
    distance: 22,
    queue: 25,
    meals: ['dinner'],
    tags: ['group', 'meaty', 'festive', 'share', 'slow'],
    groupOnly: true,
    desc: '厨师在面前点火。适合需要一个仪式感的晚上。',
    mapQuery: '铁板烧'
  },
  {
    id: 'dim-sum',
    name: '粤式早茶',
    mark: '点',
    tone: 'mustard',
    cuisine: '粤式',
    price: 68,
    distance: 20,
    queue: 18,
    meals: ['breakfast', 'lunch'],
    tags: ['group', 'share', 'breakfast', 'slow', 'comfort'],
    groupOnly: true,
    desc: '一盅两件，虾饺烧卖。周末的上午值得慢慢过。',
    mapQuery: '粤式早茶'
  },
  {
    id: 'onigiri',
    name: '便利店饭团',
    mark: '团',
    tone: 'cream',
    cuisine: '便利店',
    price: 15,
    distance: 2,
    queue: 1,
    meals: ['breakfast', 'lunch', 'dinner', 'late'],
    tags: ['emergency', 'fast', 'solo', 'light', 'handheld'],
    desc: '来不及的时候，它不评判你。配一瓶茶，也算一顿。',
    mapQuery: '便利店'
  }
];
