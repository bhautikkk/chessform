const https = require('https');
const fs = require('fs');

const letters = ['a', 'b', 'c', 'd', 'e'];
const baseUrl = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';

let completed = 0;
let rawData = [];

console.log('Downloading opening databases...');

letters.forEach(letter => {
    https.get(`${baseUrl}${letter}.tsv`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            rawData.push(data);
            completed++;
            if (completed === letters.length) {
                buildTrie();
            }
        });
    }).on('error', err => {
        console.error('Download failed for', letter, err);
    });
});

function cleanPgn(pgn) {
    // Remove move numbers like "1.", "12.", "2..."
    return pgn.replace(/[0-9]+\.+/g, '').trim().split(/\s+/).filter(m => m.length > 0);
}

function buildTrie() {
    console.log('Building Trie...');
    const trie = {};
    let count = 0;

    rawData.forEach(tsv => {
        const lines = tsv.split('\n');
        for (let i = 1; i < lines.length; i++) { // skip header
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split('\t');
            if (parts.length < 3) continue;
            
            const eco = parts[0];
            const name = parts[1];
            const pgn = parts[2];
            
            const moves = cleanPgn(pgn);
            if (moves.length === 0) continue;
            
            let current = trie;
            for (let j = 0; j < moves.length; j++) {
                const move = moves[j];
                if (!current[move]) {
                    current[move] = {};
                }
                current = current[move];
                // Only set name if it's the exact end of an opening sequence, or if not set yet
                if (j === moves.length - 1) {
                    current.n = name;
                }
            }
            count++;
        }
    });

    console.log(`Processed ${count} openings.`);
    
    const output = `window.OpeningBook = ${JSON.stringify(trie)};\n`;
    fs.writeFileSync('openings.js', output);
    console.log('Successfully wrote openings.js (' + (output.length / 1024).toFixed(2) + ' KB)');
}
