#!/usr/bin/env node
/* Reduz as texturas dentro de um .glb.
 *
 * Os modelos do Mixamo vêm com mapas 4K em PNG — dezenas de MB por personagem.
 * Num jogo de navegador o personagem ocupa poucos pixels na tela, então 1K em
 * JPEG é visualmente equivalente e cabe no orçamento de banda do celular.
 *
 * Uso: node tools/shrink_textures.js entrada.glb saida.glb [tamanho]
 */
const fs = require('fs');
const sharp = require('sharp');

const [,, inPath, outPath, sizeArg] = process.argv;
const MAX = parseInt(sizeArg || '1024', 10);

function readGLB(buf){
  if(buf.readUInt32LE(0) !== 0x46546C67) throw new Error('não é um .glb');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  return { json, bin: buf.slice(binStart, binStart + binLen) };
}

function writeGLB(json, bin){
  let jsonStr = JSON.stringify(json);
  while(jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const binPad = (4 - (bin.length % 4)) % 4;
  const binBuf = Buffer.concat([bin, Buffer.alloc(binPad)]);

  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546C67, o); o += 4;   // magic "glTF"
  out.writeUInt32LE(2, o); o += 4;            // versão
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonBuf.length, o); o += 4;
  out.writeUInt32LE(0x4E4F534A, o); o += 4;   // "JSON"
  jsonBuf.copy(out, o); o += jsonBuf.length;
  out.writeUInt32LE(binBuf.length, o); o += 4;
  out.writeUInt32LE(0x004E4942, o); o += 4;   // "BIN"
  binBuf.copy(out, o);
  return out;
}

(async () => {
  const { json, bin } = readGLB(fs.readFileSync(inPath));
  const images = json.images || [];

  // Reescreve o buffer inteiro: cada bufferView é recopiado em ordem, com as
  // imagens substituídas pelas versões reduzidas.
  const newChunks = [];
  let offset = 0;
  const newViews = [];

  const imageByView = new Map();
  images.forEach((im, idx) => {
    if(im.bufferView !== undefined) imageByView.set(im.bufferView, idx);
  });

  for(let vi = 0; vi < json.bufferViews.length; vi++){
    const bv = json.bufferViews[vi];
    let data = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);

    if(imageByView.has(vi)){
      const before = data.length;
      data = await sharp(data)
        .resize(MAX, MAX, { fit:'inside', withoutEnlargement:true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const idx = imageByView.get(vi);
      images[idx].mimeType = 'image/jpeg';
      console.log(`  textura ${idx}: ${(before/1048576).toFixed(1)}MB -> ${(data.length/1048576).toFixed(2)}MB`);
    }

    const pad = (4 - (offset % 4)) % 4;
    if(pad){ newChunks.push(Buffer.alloc(pad)); offset += pad; }

    newViews.push({ ...bv, byteOffset: offset, byteLength: data.length });
    newChunks.push(data);
    offset += data.length;
  }

  json.bufferViews = newViews;
  const newBin = Buffer.concat(newChunks);
  json.buffers = [{ byteLength: newBin.length }];

  fs.writeFileSync(outPath, writeGLB(json, newBin));
  const antes = fs.statSync(inPath).size, depois = fs.statSync(outPath).size;
  console.log(`${inPath} ${(antes/1048576).toFixed(1)}MB -> ${(depois/1048576).toFixed(1)}MB`);
})();
