# Musique de fond originale (synthèse), 15 s, 120 bpm : pas de droits d'auteur.
import numpy as np, wave, sys
SR=44100; D=15.0; n=int(SR*D); t=np.arange(n)/SR; out=np.zeros(n)
beat=0.5
def note(f): return 440*2**((f-69)/12)
def add(start, sig):
    i=int(start*SR); j=min(n,i+len(sig))
    if j>i: out[i:j]+=sig[:j-i]
def env(L,a=0.005,r=0.2):
    x=np.arange(int(L*SR))/SR; return np.minimum(1,x/a)*np.exp(-x/r)
chords=[[60,64,67],[55,59,62],[57,60,64],[53,57,60]]  # C G Am F
bass=[36,43,45,41]
for bar in range(8):
    s=bar*2; c=chords[bar%4]
    if s>=D: break
    # nappe
    L=2.0; x=np.arange(int(L*SR))/SR
    pad=sum(np.sin(2*np.pi*note(m)*x)+.3*np.sin(4*np.pi*note(m)*x) for m in c)
    add(s, .05*pad*np.minimum(1,x/.3)*np.minimum(1,(L-x)/.3))
    for b in range(4):
        tb=s+b*beat
        # kick
        L=.35; x=np.arange(int(L*SR))/SR; f=50+90*np.exp(-x*30)
        add(tb, .55*np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-x*9))
        # basse
        L=.45; x=np.arange(int(L*SR))/SR; fb=note(bass[bar%4])
        add(tb+.25, .16*np.tanh(2*np.sin(2*np.pi*fb*x))*env(L,.01,.25))
        # charleston
        L=.06; add(tb+.25, .05*np.random.randn(int(L*SR))*np.exp(-np.arange(int(L*SR))/SR*80))
        if b in (1,3):  # clap
            L=.15; add(tb, .12*np.random.randn(int(L*SR))*np.exp(-np.arange(int(L*SR))/SR*25))
        # arpège pluck
        for k in range(2):
            m=c[(b*2+k)%3]+12; L=.3; x=np.arange(int(L*SR))/SR
            add(tb+k*.25, .07*np.sign(np.sin(2*np.pi*note(m)*x))*env(L,.003,.08))
# effets « whoosh » aux changements de scène
for ts in map(float, sys.argv[2].split(',')):
    L=.5; x=np.arange(int(L*SR))/SR; nz=np.random.randn(len(x))
    nz=np.convolve(nz,np.ones(6)/6,'same'); add(ts-.25, .18*nz*np.sin(np.pi*x/L)**2)
# pop final
L=.25; x=np.arange(int(L*SR))/SR; add(13.2,.3*np.sin(2*np.pi*(600+900*x)*x)*np.exp(-x*14))
fade=np.ones(n); k=int(1.2*SR); fade[-k:]=np.linspace(1,0,k); fade[:int(.05*SR)]=np.linspace(0,1,int(.05*SR))
out=out*fade; out=out/np.max(np.abs(out))*.85
st=np.stack([out,out],1)
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st*32767).astype(np.int16).tobytes())
