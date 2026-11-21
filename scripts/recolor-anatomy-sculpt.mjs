import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/recolor-anatomy-sculpt.mjs OBJ-directory output-directory');
fs.mkdirSync(output, {recursive:true});

function readObject(filename) {
  const positions = [];
  const indices = [];
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      positions.push(...line.trim().split(/\s+/).slice(1,4).map(Number));
    } else if (line.startsWith('f ')) {
      const verts = line.trim().split(/\s+/).slice(1).map(item => Number(item.split('/')[0])-1);
      if (verts.length !== 3 || verts.some(index => !Number.isInteger(index) || index < 0 || index >= positions.length / 3)) {
        throw new Error('Expected positive triangular OBJ indices in ' + filename);
      }
      indices.push(...verts);
    }
  }
  const normals = new Float64Array(positions.length);
  // Derive smooth, area-weighted normals from the original sculpted surfaces.
  for (let i=0; i<indices.length; i+=3) {
    const a=indices[i]*3, b=indices[i+1]*3, c=indices[i+2]*3;
    const ux=positions[b]-positions[a], uy=positions[b+1]-positions[a+1], uz=positions[b+2]-positions[a+2];
    const vx=positions[c]-positions[a], vy=positions[c+1]-positions[a+1], vz=positions[c+2]-positions[a+2];
    const x=uy*vz-uz*vy, y=uz*vx-ux*vz, z=ux*vy-uy*vx;
    for (const p of [a,b,c]) { normals[p]+=x; normals[p+1]+=y; normals[p+2]+=z; }
  }
  for (let i=0; i<normals.length; i+=3) {
    const length=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
    normals[i]/=length; normals[i+1]/=length; normals[i+2]/=length;
  }
  return {positions, indices, normals};
}

const parts = fs.readdirSync(source).filter(name => /SubTool-\d+-\d+\.obj$/i.test(name))
  .map(name => ({id:Number(name.split('-')[1]),name,...readObject(path.join(source,name))})).sort((a,b) => a.id-b.id);
if (parts.length!==16 || parts.some((part,i)=>part.id!==i)) throw new Error('Unexpected source anatomy parts');

const diagnostic = [
  [85,83,82],[75,77,121],[198,162,148],[111,172,196],
  [184,131,151],[182,113,108],[230,155,89],[218,177,96],
  [118,153,92],[78,156,132],[143,108,170],[89,123,205],
  [93,163,171],[138,196,165],[194,110,179],[159,170,107],
];

const skin=[205,201,196], bone=[163,161,157], purple=[131,125,174];
const partNames = [
  'Skeleton', 'Deep support', 'Head', 'Neck', 'Back and side torso', 'Shoulders',
  'Chest and abdominal wall', 'Upper arms', 'Forearms', 'Hands and wrist tendons',
  'Glutes', 'Quadriceps', 'Hamstrings', 'Inner thighs', 'Anterior lower legs', 'Calves',
];
const paint = part => {
  const isTarget=part.id===10||part.id===11;
  return isTarget?purple:part.id<2?bone:skin;
};

function saveImage(filename, material, yawAngles) {
  const width=1160, height=950;
  const color=new Uint8Array(width*height*3), depth=new Float32Array(width*height);
  depth.fill(-Infinity);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const v=Math.max(0,1-Math.hypot((x-width/2)/width,(y-height*.5)/height)*1.55);
    color.set([25+v*9,27+v*9,33+v*10],(y*width+x)*3);
  }
  for (const [panel, yaw] of yawAngles.entries()) {
    const sin=Math.sin(yaw), cos=Math.cos(yaw), scale=11.65;
    for (const part of parts) {
      const {positions:p, normals:n, indices:f}=part;
      const screen=new Float32Array(p.length), colors=new Float32Array(p.length);
      for (let i=0; i<p.length; i+=3) {
        const x=p[i]*cos+p[i+2]*sin;
        const z=-p[i]*sin+p[i+2]*cos;
        const y=p[i+1]+9.04;
        const ny=n[i+1], nx=n[i]*cos+n[i+2]*sin, nz=-n[i]*sin+n[i+2]*cos;
        screen[i]=(panel+.5)*width/yawAngles.length+x*scale;
        screen[i+1]=height*.494-(y*.999-z*.045)*scale;
        screen[i+2]=z*.999+y*.045;
        const shade=.48+.44*Math.max(0,-.46*nx+.65*ny+.60*nz)+.15*Math.max(0,.79*nx+.27*ny-.55*nz);
        const tint=material(part,p[i],p[i+1],p[i+2]);
        for(let k=0;k<3;k++) colors[i+k]=Math.min(255,tint[k]*shade);
      }
      for (let i=0; i<f.length; i+=3) {
        const a=f[i]*3,b=f[i+1]*3,c=f[i+2]*3;
        const ax=screen[a],ay=screen[a+1],bx=screen[b],by=screen[b+1],cx=screen[c],cy=screen[c+1];
        const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
        if(Math.abs(det)<1e-6) continue;
        const left=Math.max(0,Math.floor(Math.min(ax,bx,cx))), right=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
        const top=Math.max(0,Math.floor(Math.min(ay,by,cy))), bottom=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
        for(let y=top;y<=bottom;y++) for(let x=left;x<=right;x++){
          const dx=x+.5-cx,dy=y+.5-cy;
          const u=((by-cy)*dx+(cx-bx)*dy)/det,v=((cy-ay)*dx+(ax-cx)*dy)/det,w=1-u-v;
          if(Math.min(u,v,w)<-1e-5) continue;
          const pixel=y*width+x, d=u*screen[a+2]+v*screen[b+2]+w*screen[c+2];
          if(d<=depth[pixel]) continue;
          depth[pixel]=d;
          for(let k=0;k<3;k++) color[pixel*3+k]=u*colors[a+k]+v*colors[b+k]+w*colors[c+k];
        }
      }
    }
  }
  const head=Buffer.alloc(13);
  head.writeUInt32BE(width);
  head.writeUInt32BE(height,4);
  head[8]=8; head[9]=2;
  const raw=Buffer.alloc(height*(1+width*3));
  for(let y=0;y<height;y++) raw.set(color.subarray(y*width*3,(y+1)*width*3), y*(1+width*3)+1);
  function chunk(kind,data) {
    const size=Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const body=Buffer.concat([Buffer.from(kind),data]);
    let crc=-1;
    for(const b of body){crc^=b; for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    const checksum=Buffer.alloc(4);
    checksum.writeUInt32BE((crc^-1)>>>0);
    return Buffer.concat([size,body,checksum]);
  }
  fs.writeFileSync(path.join(output,filename),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}

// Export the original source topology, with each anatomical part independently
// selectable. Coordinates are normalized to a standing 1.80 m tall glTF model.
function writeGlb() {
  const chunks=[], bufferViews=[], accessors=[], meshes=[];
  let byteLength=0;
  const align4=length=>(length+3)&~3;
  const addView=(array,target)=>{
    const raw=Buffer.from(array.buffer,array.byteOffset,array.byteLength);
    bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:raw.length,target});
    chunks.push(raw,Buffer.alloc(align4(raw.length)-raw.length));
    byteLength+=align4(raw.length);
    return bufferViews.length-1;
  };
  const addAccessor=(array,target,componentType,type,count,attributes={})=>{
    accessors.push({bufferView:addView(array,target),componentType,type,count,...attributes});
    return accessors.length-1;
  };
  const toLinear=value=>{
    const s=value/255;
    return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
  };
  const scale=1.8/(25.03+43.13);
  for(const part of parts){
    const {positions,indices,normals}=part;
    const p=new Float32Array(positions.length), colors=new Uint8Array(positions.length/3*4);
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i+=3){
      const [x,y,z]=positions.slice(i,i+3);
      p.set([(x+.09)*scale,(y+43.13)*scale,z*scale],i);
      for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[i+j]);max[j]=Math.max(max[j],p[i+j]);}
      colors.set([...paint(part,x,y,z).map(c=>Math.round(255*toLinear(c))),255],i/3*4);
    }
    const indexData=Uint16Array.from(indices);
    if (positions.length/3>65536) {
      throw new Error('Part index exceeds the 16-bit GLB index range');
    }
    const index=addAccessor(indexData,34963,5123,'SCALAR',indexData.length);
    const position=addAccessor(p,34962,5126,'VEC3',p.length/3,{min,max});
    const normal=addAccessor(Float32Array.from(normals),34962,5126,'VEC3',p.length/3);
    const color=addAccessor(colors,34962,5121,'VEC4',p.length/3,{normalized:true});
    meshes.push({name:partNames[part.id],primitives:[{
      attributes:{POSITION:position,NORMAL:normal,COLOR_0:color},indices:index,material:0,
    }]});
  }
  const model={
    asset:{
      version:'2.0',
      generator:'Form anatomy color export',
      copyright:'Source sculpture: Diego Luján García (diegoluga), CC BY 4.0. Form: recolored, recalculated normals, converted to GLB.',
      extras:{source:'https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6',
        license:'https://creativecommons.org/licenses/by/4.0/'},
    },
    scene:0,scenes:[{nodes:parts.map(part=>part.id)}],
    nodes:parts.map(part=>({name:partNames[part.id],mesh:part.id,extras:{sourceSubtool:part.id,
      ...(part.id===10?{muscle:'glute'}:part.id===11?{muscle:'quads'}:{})}})),
    meshes,materials:[{name:'Form matte clay',doubleSided:true,pbrMetallicRoughness:{
      baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.68}}],
    accessors,bufferViews,buffers:[{byteLength}],
  };
  const metadata=Buffer.from(JSON.stringify(model));
  const padded=Buffer.alloc(align4(metadata.length),0x20);
  metadata.copy(padded);
  const header=Buffer.alloc(28);
  header.write('glTF');
  header.writeUInt32LE(2,4); header.writeUInt32LE(28+padded.length+byteLength,8);
  header.writeUInt32LE(padded.length,12); header.write('JSON',16);
  header.writeUInt32LE(byteLength,20); header.write('BIN\0',24);
  fs.writeFileSync(path.join(output,'Form-Anatomy-Color-Review.glb'),
    Buffer.concat([header.subarray(0,20),padded,header.subarray(20),...chunks]));
  console.log(JSON.stringify({meshes:parts.length,triangles:parts.reduce((n,p)=>n+p.indices.length/3,0),
    vertices:parts.reduce((n,p)=>n+p.positions.length/3,0),bytes:header.readUInt32LE(8)}));
}

saveImage('source-part-map.png', part=>diagnostic[part.id], [.38,Math.PI-.35]);
saveImage('Form-Anatomy-Color-Review.png', paint, [.38,Math.PI-.35]);
writeGlb();


