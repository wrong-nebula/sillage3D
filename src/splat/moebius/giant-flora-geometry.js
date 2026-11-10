/** Plate 16: large source-derived forms using the existing sculpting interface. */
const TAU=Math.PI*2,GOLDEN=Math.PI*(3-Math.sqrt(5));
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,n)=>a.map(v=>v*n);
const radial=(a,r,y=0)=>[Math.cos(a)*r,y,Math.sin(a)*r];
const curve=(a,b,c,d)=>t=>a.map((v,i)=>v*(1-t)**3+3*b[i]*(1-t)**2*t+3*c[i]*(1-t)*t*t+d[i]*t**3);
const line=(a,b)=>t=>a.map((v,i)=>v+(b[i]-v)*t);
const blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

function crownTree(m,g,rng,flat){
 const h=g.height,w=g.width,p=g.palette,a=g.phaseAngle,stemHeight=h*(flat?.54:.73),lean=h*(flat?.17:.025);
 const stem=curve([0,0,0],radial(a,-lean*.25,stemHeight*.32),radial(a,lean*.70,stemHeight*.65),radial(a,lean,stemHeight));
 m.tube(stem,t=>h*(flat?.035:.027)*(1-.72*t)*(1+.32*Math.exp(-t*18)),{color:p.base,tip:p.base,ridges:flat?.06:.018,segments:m.near?20:10,sides:m.near?14:8});
 let leafCount=0;const attachments=[];
 for(let i=0;i<g.branches;i++){
  const az=a+i*GOLDEN+(rng()-.5)*.20,t=flat?.62+.34*i/g.branches:.78+.20*i/g.branches,root=stem(t);
  attachments.push(root[1]);
  const reach=w*(i===g.branches-1?.08:flat?.37+.09*rng():.22+.06*rng()),end=radial(az,reach,h*(flat?.76+.025*rng():.84+.07*rng()));
  const bough=curve(root,add(root,radial(az,reach*.24,h*(flat?.14:.12))),add(end,radial(az,-reach*.20,-h*.045)),end);
  m.tube(bough,v=>h*.016*(1-.75*v),{color:p.base,tip:p.base,ridges:flat?.05:.015,segments:m.near?12:6,sides:m.near?10:6});
  for(let j=0;j<3;j++){
   const q=bough(.50+j*.22),aa=az+(j-1)*.85,tip=add(q,radial(aa,w*(flat?.15:.13)));
   tip[1]=h*(flat?.79+.035*Math.sin(i*1.7+j):.88+.035*Math.sin(i*1.9+j));
   const branch=curve(q,add(q,radial(aa,w*.03,h*.035)),add(tip,radial(aa,-w*.025,0)),tip);
   m.tube(branch,v=>h*.006*(1-.72*v),{color:p.base,tip:p.base,segments:m.near?7:4,sides:6});
   for(let k=0;k<3;k++){
    const from=branch(.55+k*.21),angle=aa+(k-1)*1.05,to=add(from,radial(angle,h*.09,h*.03));
    const twig=curve(from,add(from,radial(angle,h*.03,h*.02)),add(to,[0,h*.012,0]),to);
    m.tube(twig,v=>h*.0027*(1-.7*v),{color:p.base,tip:p.base,segments:4,sides:5});
    for(let n=0;n<8;n++){
     const root=twig(.13+.85*n/8),leafAngle=angle+n*GOLDEN,len=h*(flat?.095:.080)*( .9+.2*rng());
     m.leafFrom(root,leafAngle,len,h*(.018+.035*rng()),len*.86,{shape:'round',thickness:.018,color:p.body,tip:p.tip,rows:m.near?3:2});leafCount++;
    }
   }
  }
 }
 return {primaryBoughCount:g.branches,leafCount,lowestBranchHeight:Math.min(...attachments),crownHabit:flat?'broad shallow table':'high forks above a clear bole',structure:flat?'crooked lateral woody crown':'blue clear trunk and high Y forks'};
}
const highcanopy=(m,g,rng)=>crownTree(m,g,rng,false);
const tablecanopy=(m,g,rng)=>crownTree(m,g,rng,true);

function curtainshrub(m,g,rng){
 const h=g.height,w=g.width,p=g.palette;let leaves=0;
 const stem=t=>[0,h*.18*t,0];
 m.tube(stem,t=>h*.055*(1-.45*t),{color:p.base,tip:p.base,segments:5,sides:m.near?12:7});
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,q=stem(.45+.48*rng()),reach=w*(.22+.12*rng()),rise=h*(.64+.22*rng()),tip=radial(a,reach,rise);
  const bough=curve(q,add(q,radial(a,reach*.20,h*.40)),add(tip,radial(a,-reach*.20,h*.06)),tip);
  m.tube(bough,t=>h*.023*(1-.77*t),{color:p.base,tip:p.base,segments:m.near?14:7,sides:m.near?9:6});
  for(let j=0;j<3;j++){
   const from=bough(.56+j*.21),aa=a+(j-1)*.75,end=add(from,radial(aa,w*.13,h*.02)),twig=curve(from,add(from,[0,h*.05,0]),add(end,[0,h*.035,0]),end);
   m.tube(twig,t=>h*.007*(1-.8*t),{color:p.base,tip:p.base,segments:m.near?7:4,sides:5});
   for(let k=0;k<8;k++){
    const root=twig(.12+.86*k/8),az=aa+(k%2?1:-1)*(.65+.16*rng()),length=h*(.42+.19*rng()),target=add(root,radial(az,h*.14,-Math.min(length,root[1]-h*.08)));
    const blade=curve(root,add(root,radial(az,h*.16,h*.08)),add(target,radial(az,h*.10,h*.17)),target);
    m.leaf(blade,h*(.065+.015*rng()),{angle:az+Math.PI/2,shape:'ribbon',curl:.08,thickness:.018,rows:m.near?10:5});leaves++;
   }
  }
 }
 return {archCount:g.branches,curtainLeafCount:leaves,structure:'woody arches with individually attached drooping blades'};
}

function pearlspray(m,g,rng){
 const h=g.height,w=g.width,p=g.palette;let buds=0;
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,base=radial(a,w*.07),height=h*(.64+.13*rng()),end=radial(a,w*(.18+.07*rng()),height);
  const stem=curve(base,add(base,[0,height*.40,0]),add(end,[0,-height*.30,0]),end);
  m.tube(stem,t=>h*.012*(1-.55*t),{wood:false,color:p.base,tip:p.body,segments:m.near?14:7,sides:m.near?9:6});
  for(let j=0;j<3;j++)m.leafFrom(stem(.13+j*.18),a+j*GOLDEN,w*.36,h*.10,w*.13,{shape:'spear',rows:m.near?9:4});
  const adult=g.age>.55;
  for(let j=0;j<3;j++){
   const q=stem(.69+j*.145),az=a+(j-1)*.9,tip=add(q,radial(az,w*.18,h*.13));
   const axis=curve(q,add(q,[0,h*.075,0]),add(tip,radial(az,-w*.035,0)),tip);
   m.tube(axis,t=>h*.004*(1-.65*t),{wood:false,color:p.base,tip:p.body,segments:m.near?8:4,sides:6});
   for(let k=0;k<3;k++){
    const from=axis(.50+k*.23),angle=az+(k-1)*.65,neck=add(from,radial(angle,w*.055,h*.035));
    m.tube(line(from,neck),()=>h*.0025,{wood:false,color:p.base,tip:p.body,segments:3,sides:5});
    const size=h*(adult?.018:.008);
    m.bud(neck,size,{color:p.accent,elongation:2.8});buds++;
   }
  }
 }
 return {stemCount:g.branches,sprayCount:g.branches*3,budCount:buds,budStage:g.age>.55?'expanded':'small',structure:'branched open sprays with separate oval terminal buds'};
}

function strapfountain(m,g,rng){
 const h=g.height,w=g.width;
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,r=i/Math.max(1,g.branches-1),base=radial(a,w*.045*r),reach=w*(.08+.46*r),height=h*(.97-.77*r),end=add(base,radial(a,reach,height));
  const blade=curve(base,add(base,radial(a,reach*.09,h*(.5+.14*r))),add(base,radial(a,reach*.57,h*(1.12+.15*r))),end);
  m.leaf(blade,h*(.065+.022*rng()),{angle:a+Math.PI/2,shape:'ribbon',thickness:.035,curl:.16,rows:m.near?22:11});
 }
 return {bladeCount:g.branches,flowerCount:0,seedheadCount:0,structure:'dense fountain of continuous folded strap blades'};
}

function shorelily(m,g,rng){
 const h=g.height,w=g.width,p=g.palette;let flowers=0,buds=0;
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,base=radial(a,w*.07),top=radial(a,w*(.22+.09*rng()),h*(.62+.20*rng()));
  const stem=curve(base,add(base,[0,h*.33,0]),add(top,[0,-h*.22,0]),top);
  m.tube(stem,t=>h*.012*(1-.47*t),{wood:false,color:p.base,tip:p.body,segments:m.near?13:7,sides:m.near?9:6});
  for(let j=0;j<4;j++)m.leafFrom(stem(.12+j*.18),a+j*GOLDEN,w*.32,h*.10,w*.12,{shape:'spear',thickness:.025,rows:m.near?9:4});
  if(g.age<.58){
   m.tube(t=>add(top,[0,h*.15*t,0]),t=>h*.028*(.025+.975*Math.sin(Math.PI*t)**.8),{wood:false,color:p.accent,tip:p.accent,segments:m.near?12:6,sides:m.near?12:7});buds++;continue;
  }
  for(let j=0;j<6;j++){
   const az=a+j*TAU/6,len=h*(.19+.02*rng()),end=add(top,radial(az,len,h*(.005+.055*Math.cos(az-a))));
   const petal=curve(top,add(top,radial(az,len*.17,h*.12)),add(end,radial(az,-len*.21,h*.095)),end);
   m.leaf(petal,h*.14,{angle:az+Math.PI/2,shape:'spear',color:p.accent,tip:blend(p.accent,p.tip,.08),underside:blend(p.accent,p.base,.1),thickness:.028,rows:m.near?12:6});
  }
  m.bud(add(top,[0,h*.015,0]),h*.022,{color:p.base,elongation:.5});
  for(let j=0;j<5;j++){
   const az=a+j*GOLDEN,root=add(top,radial(az,h*.013,h*.015)),tip=add(top,radial(az,h*.045,h*.12));
   m.tube(line(root,tip),()=>h*.0028,{wood:false,color:p.accent,tip:p.tip,segments:4,sides:5});m.bud(tip,h*.007,{color:p.tip,elongation:1.4});
  }
  flowers++;
 }
 return {stemCount:g.branches,flowerCount:flowers,closedBudCount:buds,tepalsPerFlower:6,structure:'separate six-tepal scarlet flowers above dry bank foliage'};
}
export const giantFloraBuilders={highcanopy,tablecanopy,curtainshrub,pearlspray,strapfountain,shorelily};
