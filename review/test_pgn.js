const { Chess } = require('chess.js');
let pgn1 = `[Event "test"]
1. e4 e5`;
let pgn2 = pgn1.replace(/\]\s*?\n(?=[^\[\s])/g, "]\n\n");
console.log("Original:", pgn1);
console.log("Replaced:", pgn2);
