  /* 日系大地色調色盤：把原本的藍／紫／橘／綠／紅等鮮豔色票，整組替換為
     茶色（主色）、鼠色（中性灰）、柿色（強調）、抹茶（完成）、臙脂（警示） */
  (function () {
    var tea   = { 50:'#f7f3ee', 100:'#eee6dc', 200:'#ddd0bf', 300:'#c7b49c', 400:'#ad977b', 500:'#947c60', 600:'#7d6650', 700:'#665242', 800:'#524236', 900:'#43372e', 950:'#2a221c' };
    var nezumi= { 50:'#f8f6f2', 100:'#efebe5', 200:'#e2ddd5', 300:'#cbc4b9', 400:'#a69e92', 500:'#857d72', 600:'#6a635a', 700:'#544e47', 800:'#3d3934', 900:'#2b2825', 950:'#1c1a18' };
    var kaki  = { 50:'#fbf4ee', 100:'#f5e4d6', 200:'#ebc9ad', 300:'#dcaa86', 400:'#c98b63', 500:'#b6724a', 600:'#a0613f', 700:'#7f4b31', 800:'#663d2a', 900:'#523224', 950:'#331f16' };
    var matcha= { 50:'#f3f5ef', 100:'#e4e9dc', 200:'#ccd5bd', 300:'#adbb99', 400:'#8e9f78', 500:'#74865f', 600:'#5d6d4c', 700:'#4a573e', 800:'#3c4633', 900:'#31392b', 950:'#1d2219' };
    var enji  = { 50:'#f9f1ef', 100:'#f1dfdb', 200:'#e3c0b8', 300:'#d09a8f', 400:'#b8766a', 500:'#a05b4f', 600:'#874a40', 700:'#6e3c35', 800:'#59322c', 900:'#4a2a26', 950:'#2e1a17' };
    var aonibi= { 50:'#f2f4f2', 100:'#e1e6e3', 200:'#c6cfca', 300:'#a3b2aa', 400:'#81948a', 500:'#677a70', 600:'#53635b', 700:'#44514a', 800:'#38423d', 900:'#2f3733', 950:'#1c211e' };
    var fuji  = { 50:'#f6f3f4', 100:'#ebe4e6', 200:'#d8cbcf', 300:'#bfa9b0', 400:'#a3878f', 500:'#8a6d76', 600:'#73585f', 700:'#5e484e', 800:'#4d3c41', 900:'#413338', 950:'#281f22' };
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            blue: tea, indigo: tea, sky: tea,
            slate: nezumi, gray: nezumi, zinc: nezumi, neutral: nezumi, stone: nezumi,
            orange: kaki, amber: kaki, yellow: kaki,
            green: matcha, emerald: matcha, lime: matcha,
            red: enji, rose: enji,
            teal: aonibi, cyan: aonibi,
            purple: fuji, violet: fuji, pink: fuji, fuchsia: fuji
          }
        }
      }
    };
  })();
