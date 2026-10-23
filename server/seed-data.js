// Seed data: category tree (editable later from admin) + curated demo products.
// Category: [slug, name_ar, name_en, icon, children?]
const C = (slug, ar, en, icon, children = []) => ({ slug, ar, en, icon, children });

const categories = [
  C('fashion', 'الملابس والأزياء', 'Fashion & Clothing', 'shirt', [
    C('men-clothing', 'ملابس رجالية', "Men's Clothing", 'shirt', [
      C('men-shirts', 'قمصان', 'Shirts', 'shirt'), C('men-tshirts', 'تيشيرتات', 'T-Shirts', 'shirt'),
      C('men-pants', 'بناطيل', 'Pants', 'shirt'), C('men-jeans', 'جينز', 'Jeans', 'shirt'),
      C('men-trousers', 'سراويل', 'Trousers', 'shirt'), C('men-shorts', 'شورتات', 'Shorts', 'shirt'),
      C('men-jackets', 'سترات', 'Jackets', 'shirt'), C('men-coats', 'معاطف', 'Coats', 'shirt'),
      C('men-sportswear', 'ملابس رياضية', 'Sportswear', 'shirt'), C('men-underwear', 'ملابس داخلية', 'Underwear', 'shirt'),
    ]),
    C('women-clothing', 'ملابس نسائية', "Women's Clothing", 'dress', [
      C('women-dresses', 'فساتين', 'Dresses', 'dress'), C('women-shirts', 'قمصان', 'Shirts', 'dress'),
      C('women-blouses', 'بلوزات', 'Blouses', 'dress'), C('women-pants', 'بناطيل', 'Pants', 'dress'),
      C('women-jeans', 'جينز', 'Jeans', 'dress'), C('women-skirts', 'تنانير', 'Skirts', 'dress'),
      C('women-coats', 'معاطف', 'Coats', 'dress'), C('women-jackets', 'سترات', 'Jackets', 'dress'),
      C('women-homewear', 'ملابس منزلية', 'Homewear', 'dress'), C('women-sportswear', 'ملابس رياضية', 'Sportswear', 'dress'),
    ]),
    C('kids-clothing', 'ملابس الأطفال', "Kids' Clothing", 'baby', [
      C('kids-boys', 'ملابس الأولاد', 'Boys', 'baby'), C('kids-girls', 'ملابس البنات', 'Girls', 'baby'),
      C('kids-babies', 'ملابس الرضع', 'Babies', 'baby'), C('kids-sets', 'أطقم الأطفال', 'Kids Sets', 'baby'),
      C('kids-sleepwear', 'ملابس النوم', 'Sleepwear', 'baby'),
    ]),
    C('shoes', 'الأحذية', 'Shoes', 'shoe', [
      C('men-shoes', 'أحذية رجالية', "Men's Shoes", 'shoe'), C('women-shoes', 'أحذية نسائية', "Women's Shoes", 'shoe'),
      C('kids-shoes', 'أحذية أطفال', "Kids' Shoes", 'shoe'), C('sneakers', 'أحذية رياضية', 'Sneakers', 'shoe'),
      C('classic-shoes', 'أحذية كلاسيكية', 'Classic Shoes', 'shoe'), C('winter-shoes', 'أحذية شتوية', 'Winter Boots', 'shoe'),
      C('sandals', 'صنادل', 'Sandals', 'shoe'),
    ]),
    C('bags-accessories', 'الحقائب والإكسسوارات', 'Bags & Accessories', 'bag', [
      C('bags', 'حقائب', 'Bags', 'bag'), C('wallets', 'محافظ', 'Wallets', 'bag'), C('belts', 'أحزمة', 'Belts', 'bag'),
      C('sunglasses', 'نظارات', 'Glasses', 'glasses'), C('watches', 'ساعات', 'Watches', 'watch'),
      C('hats', 'قبعات', 'Hats', 'bag'), C('fashion-accessories', 'إكسسوارات الموضة', 'Fashion Accessories', 'gem'),
    ]),
    C('occasions-seasonal', 'مستلزمات المناسبات والأزياء الموسمية', 'Occasions & Seasonal', 'gift'),
  ]),
  C('home-kitchen', 'المنزل والمطبخ', 'Home & Kitchen', 'home', [
    C('cookware', 'أواني الطبخ', 'Cookware', 'pot', [
      C('pots', 'قدور', 'Pots', 'pot'), C('pans', 'مقالي', 'Pans', 'pot'), C('pressure-cookers', 'طناجر ضغط', 'Pressure Cookers', 'pot'),
      C('cookware-sets', 'أطقم أواني', 'Cookware Sets', 'pot'), C('trays', 'صوانٍ', 'Trays', 'pot'),
    ]),
    C('kitchen-tools', 'أدوات المطبخ', 'Kitchen Tools', 'utensils', [
      C('knives', 'سكاكين المطبخ', 'Kitchen Knives', 'utensils'), C('spoons', 'ملاعق', 'Spoons', 'utensils'),
      C('cutting-tools', 'أدوات التقطيع', 'Cutting Tools', 'utensils'), C('baking-molds', 'قوالب الخَبز', 'Baking Molds', 'utensils'),
      C('prep-tools', 'أدوات التحضير', 'Prep Tools', 'utensils'),
    ]),
    C('serveware', 'مستلزمات تقديم الطعام', 'Serveware', 'cup', [
      C('plates', 'أطباق', 'Plates', 'cup'), C('cups', 'أكواب', 'Cups & Mugs', 'cup'), C('glassware', 'كؤوس', 'Glassware', 'cup'),
      C('cutlery', 'أدوات المائدة', 'Cutlery', 'cup'),
    ]),
    C('home-organization', 'تنظيم المنزل', 'Home Organization', 'box', [
      C('storage-boxes', 'علب التخزين', 'Storage Boxes', 'box'), C('shelves', 'رفوف', 'Shelves', 'box'),
      C('drawer-organizers', 'منظمات الأدراج', 'Drawer Organizers', 'box'), C('stands', 'حوامل', 'Stands & Holders', 'box'),
    ]),
    C('home-decor', 'ديكور المنزل', 'Home Decor', 'lamp', [
      C('paintings', 'لوحات', 'Wall Art', 'lamp'), C('lamps', 'مصابيح', 'Lamps', 'lamp'), C('clocks', 'ساعات حائط', 'Clocks', 'lamp'),
      C('vases', 'مزهريات', 'Vases', 'lamp'), C('decorations', 'ديكورات', 'Decorations', 'lamp'),
    ]),
    C('bath-cleaning', 'مستلزمات الحمام والتنظيف', 'Bath & Cleaning', 'drop'),
    C('bedroom-furniture', 'غرف النوم والأثاث المنزلي الصغير', 'Bedroom & Small Furniture', 'bed'),
  ]),
  C('appliances', 'الأجهزة الكهربائية والمنزلية', 'Home Appliances', 'plug', [
    C('coffee', 'أجهزة القهوة', 'Coffee Appliances', 'coffee', [
      C('coffee-machines', 'ماكينات القهوة', 'Coffee Machines', 'coffee'), C('coffee-grinders', 'مطاحن البن', 'Coffee Grinders', 'coffee'),
      C('coffee-tools', 'أدوات تحضير القهوة', 'Coffee Tools', 'coffee'),
    ]),
    C('cooking-appliances', 'أجهزة الطهي', 'Cooking Appliances', 'flame', [
      C('electric-cookers', 'أجهزة الطهي الكهربائية', 'Electric Cookers', 'flame'), C('air-fryers', 'القلايات الهوائية', 'Air Fryers', 'flame'),
      C('grills', 'الشوايات', 'Grills', 'flame'), C('thermo-mixers', 'الخلاطات الحرارية', 'Thermo Mixers', 'flame'),
    ]),
    C('kitchen-appliances', 'أجهزة المطبخ', 'Kitchen Appliances', 'blender', [
      C('blenders', 'خلاطات', 'Blenders', 'blender'), C('juicers', 'عصارات', 'Juicers', 'blender'),
      C('food-processors', 'محضرات طعام', 'Food Processors', 'blender'), C('grinders', 'مطاحن', 'Grinders', 'blender'),
      C('kettles', 'غلايات', 'Kettles', 'blender'),
    ]),
    C('cleaning-appliances', 'أجهزة التنظيف', 'Cleaning Appliances', 'sparkle', [
      C('vacuums', 'مكانس كهربائية', 'Vacuum Cleaners', 'sparkle'), C('small-cleaners', 'أجهزة تنظيف صغيرة', 'Small Cleaners', 'sparkle'),
    ]),
    C('garment-care', 'أجهزة العناية بالملابس', 'Garment Care', 'iron', [
      C('irons', 'مكاوي', 'Irons', 'iron'), C('steamers', 'أجهزة بخار الملابس', 'Garment Steamers', 'iron'),
    ]),
    C('heating-cooling', 'أجهزة التبريد والتدفئة الصغيرة', 'Heating & Cooling', 'snow'),
    C('appliance-accessories', 'إكسسوارات وقطع ملحقة بالأجهزة', 'Appliance Accessories', 'plug'),
  ]),
  C('electronics', 'الإلكترونيات والتقنية', 'Electronics & Tech', 'phone', [
    C('smartphones', 'الهواتف الذكية وملحقاتها', 'Smartphones & Accessories', 'phone'),
    C('tablets', 'الأجهزة اللوحية', 'Tablets', 'tablet'),
    C('chargers-cables', 'شواحن وكابلات وبطاريات متنقلة', 'Chargers, Cables & Power Banks', 'battery'),
    C('headphones', 'سماعات الرأس والأذن', 'Headphones & Earbuds', 'headphones'),
    C('laptops', 'الحواسيب المحمولة وملحقاتها', 'Laptops & Accessories', 'laptop'),
    C('keyboards-mice', 'لوحات المفاتيح والفأرات', 'Keyboards & Mice', 'keyboard'),
    C('monitors', 'الشاشات وأجهزة العرض', 'Monitors & Projectors', 'monitor'),
    C('gaming', 'أجهزة الألعاب وملحقاتها', 'Gaming', 'gamepad'),
    C('cameras', 'الكاميرات ومستلزماتها', 'Cameras & Gear', 'camera'),
    C('networking', 'أجهزة الشبكات والاتصال', 'Networking', 'wifi'),
    C('wearables', 'الساعات الذكية والأجهزة القابلة للارتداء', 'Smartwatches & Wearables', 'watch'),
    C('storage', 'وحدات التخزين والذاكرة', 'Storage & Memory', 'chip'),
    C('office-electronics', 'مستلزمات المكتب الإلكتروني', 'Office Electronics', 'printer'),
  ]),
  C('beauty', 'الجمال والعناية الشخصية', 'Beauty & Personal Care', 'sparkle', [
    C('skincare', 'العناية بالبشرة', 'Skin Care', 'drop'), C('haircare', 'العناية بالشعر', 'Hair Care', 'drop'),
    C('shampoo', 'الشامبو والبلسم والماسكات', 'Shampoo, Conditioner & Masks', 'drop'),
    C('hair-styling', 'أدوات تصفيف الشعر', 'Hair Styling Tools', 'sparkle'), C('perfumes', 'العطور', 'Perfumes', 'perfume'),
    C('makeup', 'مستحضرات التجميل', 'Makeup', 'lipstick'), C('shaving', 'أدوات الحلاقة والعناية باللحية', 'Shaving & Beard Care', 'razor'),
    C('personal-care-devices', 'أجهزة العناية الشخصية', 'Personal Care Devices', 'plug'),
    C('hygiene', 'مستلزمات النظافة الشخصية', 'Personal Hygiene', 'drop'),
  ]),
  C('baby', 'منتجات الأطفال والرضع', 'Baby & Kids', 'baby'),
  C('toys', 'الألعاب والهوايات', 'Toys & Hobbies', 'puzzle'),
  C('sports', 'الرياضة واللياقة', 'Sports & Fitness', 'ball'),
  C('auto', 'السيارات وإكسسواراتها', 'Car Accessories', 'car'),
  C('tools', 'الأدوات اليدوية ومستلزمات الصيانة', 'Tools & Maintenance', 'wrench'),
  C('stationery', 'القرطاسية واللوازم المكتبية', 'Stationery & Office', 'pen'),
  C('travel', 'مستلزمات السفر', 'Travel Essentials', 'plane'),
  C('pets', 'منتجات الحيوانات الأليفة', 'Pet Supplies', 'paw'),
];

// [dummyId, categorySlug, name_ar, variantKind]
const products = [
  [1, 'makeup', 'ماسكارا إيسنس لاش برنسس', 'none'], [2, 'makeup', 'باليت ظلال عيون مع مرآة', 'none'],
  [3, 'makeup', 'علبة بودرة فيلفيت تاتش', 'none'], [4, 'makeup', 'أحمر شفاه أحمر كلاسيكي', 'none'],
  [5, 'makeup', 'طلاء أظافر أحمر', 'none'],
  [6, 'perfumes', 'عطر كالفن كلاين CK One', 'ml'], [7, 'perfumes', 'عطر شانيل كوكو نوار', 'ml'],
  [8, 'perfumes', 'عطر ديور جادور', 'ml'], [9, 'perfumes', 'عطر دولتشي شاين', 'ml'], [10, 'perfumes', 'عطر غوتشي بلوم', 'ml'],
  [13, 'bedroom-furniture', 'طاولة سرير خشب الكرز الأفريقي', 'none'], [14, 'bedroom-furniture', 'كرسي مكتب تنفيذي كنول سارينن', 'none'],
  [43, 'decorations', 'أرجوحة ديكور معلقة', 'none'], [44, 'paintings', 'إطار صور شجرة العائلة', 'none'],
  [45, 'decorations', 'نبتة زينة للمنزل', 'none'], [46, 'vases', 'أصيص نباتات أنيق', 'none'], [47, 'lamps', 'مصباح طاولة عصري', 'none'],
  [48, 'prep-tools', 'ملعقة طبخ من الخيزران', 'none'], [49, 'cups', 'كوب ألمنيوم أسود', 'none'], [50, 'prep-tools', 'مضرب بيض أسود', 'none'],
  [51, 'blenders', 'خلاط كهربائي متعدد السرعات', 'none'], [52, 'pans', 'مقلاة ووك من الفولاذ الكربوني', 'none'],
  [53, 'cutting-tools', 'لوح تقطيع خشبي', 'none'], [54, 'prep-tools', 'عصارة حمضيات يدوية صفراء', 'none'],
  [56, 'electric-cookers', 'موقد كهربائي', 'none'], [58, 'cutlery', 'شوكة طعام من الستانلس', 'none'],
  [59, 'glassware', 'كأس زجاجي شفاف', 'none'], [60, 'cutting-tools', 'مبشرة سوداء متعددة الأوجه', 'none'],
  [61, 'blenders', 'خلاط يدوي كهربائي', 'none'], [62, 'prep-tools', 'قالب مكعبات ثلج', 'none'], [64, 'knives', 'سكين مطبخ احترافي', 'none'],
  [65, 'storage-boxes', 'علبة غداء محكمة الإغلاق', 'none'], [66, 'electric-cookers', 'فرن ميكروويف', 'none'],
  [67, 'stands', 'حامل أكواب على شكل شجرة', 'none'], [68, 'pans', 'مقلاة غير لاصقة', 'none'], [69, 'plates', 'طبق تقديم أبيض', 'none'],
  [71, 'pots', 'قدر فضي بغطاء زجاجي', 'none'], [73, 'shelves', 'رف توابل منظم', 'none'], [74, 'spoons', 'ملعقة طعام', 'none'],
  [75, 'trays', 'صينية تقديم', 'none'], [76, 'baking-molds', 'شوبك عجين خشبي', 'none'],
  [78, 'laptops', 'آبل ماك بوك برو 14 بوصة رمادي', 'none'], [79, 'laptops', 'أسوس زينبوك برو بشاشتين', 'none'],
  [80, 'laptops', 'هواوي ميت بوك X برو', 'none'], [81, 'laptops', 'لينوفو يوغا 920', 'none'], [82, 'laptops', 'ديل XPS 13 الجديد', 'none'],
  [83, 'men-shirts', 'قميص مربعات أزرق وأسود', 'apparel'], [84, 'men-tshirts', 'تيشيرت رجالي غيغابايت أوروس', 'tshirt'],
  [85, 'men-shirts', 'قميص رجالي بنقشة الكاروهات', 'apparel'], [86, 'men-shirts', 'قميص رجالي بأكمام قصيرة', 'apparel'],
  [87, 'men-shirts', 'قميص رجالي مربعات عصري', 'apparel'],
  [88, 'sneakers', 'نايكي إير جوردن 1 أحمر وأسود', 'mshoe'], [89, 'men-shoes', 'حذاء نايكي رياضي للملاعب', 'mshoe'],
  [90, 'sneakers', 'بوما فيوتشر رايدر', 'mshoe'], [91, 'sneakers', 'حذاء رياضي أوف وايت أبيض وأحمر', 'mshoe'],
  [93, 'watches', 'ساعة بحزام جلدي بني', 'none'], [94, 'watches', 'ساعة لونجين ماستر كولكشن', 'none'],
  [97, 'watches', 'ساعة رولكس ديت جاست', 'none'],
  [100, 'headphones', 'سماعات آبل إيربودز', 'none'], [101, 'headphones', 'سماعات آبل إيربودز ماكس فضي', 'none'],
  [102, 'chargers-cables', 'شاحن آبل لاسلكي', 'none'], [104, 'chargers-cables', 'شاحن آيفون الأصلي', 'none'],
  [105, 'chargers-cables', 'بطارية آبل ماغ سيف المتنقلة', 'none'], [106, 'wearables', 'ساعة آبل الإصدار 4 ذهبية', 'none'],
  [107, 'headphones', 'سماعات بيتس فليكس اللاسلكية', 'none'], [108, 'smartphones', 'غطاء سيليكون آيفون 12 ماغ سيف', 'none'],
  [109, 'cameras', 'حامل أحادي للتصوير', 'none'], [110, 'cameras', 'مصباح سيلفي للهاتف', 'none'], [111, 'cameras', 'عصا سيلفي قابلة للتمديد', 'none'],
  [118, 'hygiene', 'صابون يدين أتيتيود بالأوراق الطبيعية', 'none'], [119, 'skincare', 'غسول جسم أولاي بزبدة الشيا', 'none'],
  [120, 'skincare', 'لوشن فازلين للرجال للوجه والجسم', 'none'],
  [123, 'smartphones', 'آيفون 13 برو', 'phone'], [124, 'smartphones', 'آيفون X', 'phone'], [125, 'smartphones', 'أوبو A57', 'phone'],
  [126, 'smartphones', 'أوبو F19 برو بلس', 'phone'], [128, 'smartphones', 'ريلمي C35', 'phone'], [129, 'smartphones', 'ريلمي X', 'phone'],
  [130, 'smartphones', 'ريلمي XT', 'phone'], [133, 'smartphones', 'سامسونغ غالاكسي S10', 'phone'], [134, 'smartphones', 'فيفو S1', 'phone'],
  [136, 'smartphones', 'فيفو X21', 'phone'],
  [140, 'sports', 'كرة سلة احترافية', 'none'], [147, 'sports', 'كرة قدم', 'none'], [151, 'sports', 'كرات تنس', 'none'],
  [152, 'sports', 'مضرب تنس', 'none'], [153, 'sports', 'كرة طائرة', 'none'], [146, 'sports', 'ريشة بادمنتون', 'none'],
  [154, 'sunglasses', 'نظارة شمسية سوداء', 'none'], [155, 'sunglasses', 'نظارة شمسية كلاسيكية', 'none'],
  [156, 'sunglasses', 'نظارة باللونين الأخضر والأسود', 'none'], [158, 'sunglasses', 'نظارة شمسية عصرية', 'none'],
  [159, 'tablets', 'آيباد ميني 2021', 'none'], [160, 'tablets', 'سامسونغ غالاكسي تاب S8 بلس', 'none'],
  [161, 'tablets', 'سامسونغ غالاكسي تاب أبيض', 'none'],
  [162, 'women-dresses', 'فستان أزرق أنيق', 'apparel'], [163, 'kids-girls', 'فستان صيفي للبنات', 'kids'],
  [164, 'women-dresses', 'فستان رمادي', 'apparel'], [165, 'kids-girls', 'فستان قصير للبنات', 'kids'],
  [166, 'women-dresses', 'فستان بنقشة الترتان', 'apparel'],
  [172, 'bags', 'حقيبة يد نسائية زرقاء', 'none'], [173, 'bags', 'حقيبة جلدية نسائية هيشي', 'none'],
  [175, 'bags', 'حقيبة ظهر بيضاء من الجلد الصناعي', 'none'], [176, 'bags', 'حقيبة يد نسائية سوداء', 'none'],
  [177, 'women-dresses', 'فستان سهرة أسود', 'apparel'], [178, 'women-skirts', 'طقم كورسيه جلدي مع تنورة', 'apparel'],
  [179, 'women-skirts', 'كورسيه مع تنورة سوداء', 'apparel'], [180, 'women-dresses', 'فستان بازلائي', 'apparel'],
  [182, 'fashion-accessories', 'أقراط كريستال خضراء', 'none'], [183, 'fashion-accessories', 'أقراط بيضاوية خضراء', 'none'],
  [184, 'fashion-accessories', 'أقراط استوائية', 'none'],
  [185, 'sandals', 'شبشب أسود وبني', 'wshoe'], [186, 'women-shoes', 'حذاء كعب كالفن كلاين', 'wshoe'],
  [187, 'women-shoes', 'حذاء نسائي ذهبي', 'wshoe'], [188, 'women-shoes', 'حذاء بامبي النسائي', 'wshoe'],
  [189, 'women-shoes', 'حذاء أحمر نسائي', 'wshoe'],
  [193, 'watches', 'ساعة نسائية ذهبية', 'none'], [194, 'watches', 'ساعة يد نسائية أنيقة', 'none'],
];

const variantKinds = {
  none: [[null, null]],
  apparel: ['S', 'M', 'L', 'XL'].map(s => [null, s]),
  kids: ['4Y', '6Y', '8Y', '10Y'].map(s => [null, s]),
  tshirt: ['black', 'white'].flatMap(c => ['M', 'L', 'XL'].map(s => [c, s])),
  mshoe: ['40', '41', '42', '43', '44'].map(s => [null, s]),
  wshoe: ['36', '37', '38', '39', '40'].map(s => [null, s]),
  phone: ['black', 'silver', 'blue'].map(c => [c, null]),
  ml: ['50ml', '100ml'].map(s => [null, s]),
};

const descTemplates = {
  makeup: n => `${n} بتركيبة عالية الجودة تدوم طويلًا، لمسة احترافية مناسبة للاستخدام اليومي والمناسبات.`,
  perfumes: n => `${n} الأصلي برائحة فاخرة وثبات عالٍ، خيار مثالي كهدية أو للاستخدام اليومي.`,
  smartphones: n => `${n} بأداء سلس وكاميرا مميزة وتصميم أنيق. منتج أصلي مع ضمان.`,
  laptops: n => `${n}: حاسوب محمول قوي بتصميم نحيف وشاشة عالية الدقة، مثالي للعمل والدراسة والإبداع.`,
  tablets: n => `${n} بشاشة واضحة وبطارية طويلة العمر، مناسب للترفيه والعمل والدراسة.`,
  fashion: n => `${n} بخامة مريحة وقصّة عصرية تناسب جميع الإطلالات اليومية.`,
  shoes: n => `${n} مريح وعملي بتصميم عصري ونعل متين، مناسب للاستخدام اليومي.`,
  kitchen: n => `${n} مصنوع من خامات متينة وآمنة على الطعام، سهل التنظيف والاستخدام.`,
  appliance: n => `${n} بأداء قوي واستهلاك موفر للطاقة، يسهّل مهامك اليومية في المطبخ.`,
  decor: n => `${n} يضفي لمسة دافئة وأنيقة على منزلك.`,
  tech: n => `${n} من الملحقات الأصلية عالية الجودة، توافق ممتاز وأداء موثوق.`,
  watch: n => `${n} بتصميم فاخر وتفاصيل دقيقة، إطلالة أنيقة لكل المناسبات.`,
  generic: n => `${n} منتج عالي الجودة مختار بعناية ليناسب احتياجاتك.`,
};
const descFor = (cat) => {
  if (['makeup'].includes(cat)) return descTemplates.makeup;
  if (cat === 'perfumes') return descTemplates.perfumes;
  if (cat === 'smartphones') return descTemplates.smartphones;
  if (cat === 'laptops') return descTemplates.laptops;
  if (cat === 'tablets') return descTemplates.tablets;
  if (/shirts|tshirts|dresses|skirts|girls/.test(cat)) return descTemplates.fashion;
  if (/shoes|sneakers|sandals/.test(cat)) return descTemplates.shoes;
  if (/blenders|electric-cookers/.test(cat)) return descTemplates.appliance;
  if (/pans|pots|prep|cut|knives|spoons|cutlery|plates|cups|glass|trays|baking|storage|stands|shelves/.test(cat)) return descTemplates.kitchen;
  if (/lamps|vases|paintings|decorations|bedroom/.test(cat)) return descTemplates.decor;
  if (/headphones|chargers|cameras|wearables/.test(cat)) return descTemplates.tech;
  if (/watches|sunglasses|bags|fashion-accessories/.test(cat)) return descTemplates.watch;
  return descTemplates.generic;
};

module.exports = { categories, products, variantKinds, descFor };
