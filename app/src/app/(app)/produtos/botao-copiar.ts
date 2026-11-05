/**
 * Botão de favoritos "Copiar para o ArVirtual": roda na página do anúncio aberta no navegador do usuário (ML, Shopee,
 * Magalu ou qualquer loja), lê título, descrição, fotos em alta, vídeos e preço do que a página mostra e abre o ERP
 * já criando o produto. Nada é buscado pelo servidor: é a página que o próprio usuário está vendo.
 */
export function codigoBotaoCopiar(origem: string) {
  const js = `(()=>{
var q=function(s){return document.querySelector(s)};
var meta=function(p){var m=q('meta[property="'+p+'"],meta[name="'+p+'"]');return m?m.content:''};
var prod=null;
document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{var d=JSON.parse(s.textContent);var l=Array.isArray(d)?d:(d['@graph']||[d]);l.forEach(function(x){if([].concat(x['@type']).indexOf('Product')>=0)prod=x})}catch(e){}});
var fotos=[];
var add=function(u){try{u=new URL(u,location.href).href}catch(e){return}if(/^https?:/.test(u)&&!/sprite|logo|icon|avatar|\\.svg|\\.gif/i.test(u)&&fotos.indexOf(u)<0)fotos.push(u)};
if(prod&&prod.image)[].concat(prod.image).forEach(function(i){add(typeof i==='string'?i:i.url)});
document.querySelectorAll('img[data-zoom]').forEach(function(i){add(i.getAttribute('data-zoom'))});
document.querySelectorAll('img').forEach(function(i){var u=i.getAttribute('data-zoom')||i.currentSrc||i.src||'';
if(/mlstatic\\.com\\/D_/.test(u))add(u.replace(/-[A-Z]\\.(webp|jpg|png)/,'-F.$1'));
if(/susercontent\\.com\\/file\\//.test(u))add(u.replace(/@resize[^.]*/,'').replace(/_tn(\\.|$)/,'$1'));});
if(!fotos.length)add(meta('og:image'));
var videos=[];document.querySelectorAll('video,video source').forEach(function(v){var u=v.currentSrc||v.src||'';if(/^https?:.*\\.mp4/i.test(u)&&videos.indexOf(u)<0)videos.push(u)});
var mlDesc=q('.ui-pdp-description__content');
var h1=q('h1');
var oferta=prod&&[].concat(prod.offers||[])[0];
var precoMeta=q('meta[itemprop="price"]');
var d={titulo:(prod&&prod.name)||(h1&&h1.innerText.trim())||meta('og:title')||document.title,
descricao:(mlDesc&&mlDesc.innerText)||(prod&&prod.description)||meta('og:description')||'',
fotos:fotos.slice(0,20),videos:videos.slice(0,3),
preco:Number(oferta&&oferta.price)||Number(precoMeta&&precoMeta.content)||0,
gtin:(prod&&(prod.gtin13||prod.gtin))||'',link:location.href};
if(!d.fotos.length&&!d.titulo){alert('Não achei o produto nesta página.');return}
var b=btoa(unescape(encodeURIComponent(JSON.stringify(d))));
window.open('${origem}/produtos/novo#importar='+encodeURIComponent(b),'_blank');
})();`;
  return `javascript:${encodeURIComponent(js.replace(/\n/g, ""))}`;
}
