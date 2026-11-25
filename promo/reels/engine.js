// Moteur d'animation image par image : window.render(t) place chaque élément à l'instant t (secondes).
const ease = x => x<0?0:x>1?1:1-Math.pow(1-x,3);
const back = x => { x=Math.max(0,Math.min(1,x)); const c=1.7; return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2); };
window.render = (t) => {
  document.querySelectorAll('[data-a]').forEach(el => {
    const [a,b] = el.dataset.a.split(',').map(Number);
    const fx = el.dataset.fx || 'up', d = +(el.dataset.d || .45);
    const pin = (t-a)/d, pout = b ? (t-b)/.3 : -1;
    let o = ease(pin), tr = '';
    if (fx==='up') tr = `translateY(${(1-ease(pin))*80}px)`;
    if (fx==='pop') { const s = back(pin); tr = `scale(${.3+.7*s})`; o = Math.min(1,pin*3); }
    if (fx==='left') tr = `translateX(${(1-ease(pin))*-700}px)`;
    if (fx==='right') tr = `translateX(${(1-ease(pin))*700}px)`;
    if (fx==='down') tr = `translateY(${(1-back(pin))*-260}px)`;
    if (pout>0) { o *= 1-ease(pout); tr += ` translateY(${ease(pout)*-60}px)`; }
    el.style.opacity = Math.max(0,Math.min(1,o)); el.style.transform = tr;
  });
  if (window.custom) window.custom(t);
};
