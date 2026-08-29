export function PhysicsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="card panel">
      <div className="panel-head-row">
        <span className="panel-title">BİLİMSEL SPESİFİKASYON</span>
        <button onClick={onClose}>KAPAT ×</button>
      </div>
      <div className="panel-body">
      <div className="sect">● UZAY-ZAMAN</div>
      <div className="body">
        Geometri: dönmeyen, yüksüz <b>Schwarzschild</b> karadeliği. Uzunluk birimi olay ufku yarıçapıdır. Cisim
        dinamiği <b>tam zamansal jeodezik denklemleriyle</b> çözülür: korunan özgül enerji E ve açısal momentum L
        ile etkin potansiyel formu, RK4 entegratörü. ISCO (3 r<sub>s</sub>), foton küresi (1.5 r<sub>s</sub>),
        E<sub>ISCO</sub> = √(8/9) ≈ 0.943 bu denklemlerin doğal sonucudur — elle konmaz.
      </div>
      <div className="fx">
        r<sub>s</sub> = 2GM/c² = 1 &nbsp;|&nbsp; (dr/dτ)² = E² − (1 − r<sub>s</sub>/r)(1 + L²/r²)
      </div>
      <div className="fx">
        d²r/dτ² = −GM/r² + L²/r³ − 3GM·L²/r⁴ &nbsp;·&nbsp; dφ/dτ = L/r²
      </div>
      <div className="sect">● ZAMAN GENİŞLEMESİ &amp; KIZILA KAYMA</div>
      <div className="body">
        Sahne <b>uzak gözlemcinin koordinat zamanında</b> akar: öz zaman adımı dτ = dt·(1−r<sub>s</sub>/r)/E ile
        daralır, bu yüzden ufka yaklaşan cisim <b>kendiliğinden</b> yavaşlar, kızıla kayar ve{' '}
        <b>ufku geçerken asla görülmez — donar ve soner</b>. Telemetrideki z ve × değerleri kütleçekim ve hareket
        etkilerini birlikte taşıyan toplam değerlerdir; ISCO'daki dairesel yörüngede tam 1.414× verir.
      </div>
      <div className="fx">
        dt/dτ = E / (1 − r<sub>s</sub>/r) &nbsp;|&nbsp; v<sub>yerel</sub> = √(1 − f/E²) &nbsp;|&nbsp; 1 + z =
        E/f
      </div>
      <div className="sect">● SPAGETTİLEŞME (GELGİT KUVVETİ)</div>
      <div className="body">
        Gelgit ivmesi cismin iki ucu arasındaki çekim farkıdır ve r³ ile büyür: cisim radyal eksende sürekli{' '}
        <b>uzar</b>, enine büzülür (hacim korunur). Telemetrideki gradyan serbest düşen çerçevede GR'nin de
        verdiği tam katsayıyla (2GM·ℓ/r³) hesaplanır; gövdenin ekrandaki uzama animasyonu ise bu gradyanı izleyen
        bir görselleştirme eğrisidir. Kopan enkazın her parçacığı <b>kendi tam jeodeziğini</b> izleyerek ufka
        akar.
      </div>
      <div className="fx">
        Δa = 2GM·ℓ / r³ &nbsp;(radyal, serbest düşen çerçevede GR ile birebir)
      </div>
      <div className="sect">● İKİ GERÇEK KARA DELİK (KERR)</div>
      <div className="body">
        Delik dinamiği <b>Kerr metriğinin ekvatoral jeodezikleriyle</b> çözülür (Bardeen–Press–Teukolsky
        1972); ISCO, dairesel yörünge E, L ve dt/dτ, ölçülmüş spin a*'dan türetilir. <b>A0620-00</b>: M = 6.6
        M☉ (Cantrell+ 2010), a* ≈ 0.12 (Gou+ 2010) — düşük spin: kararlı yörüngede genişleme tavanı ~×1.4.{' '}
        <b>Cygnus X-1</b>: M = 21.2 M☉ (Miller-Jones+ 2021), a* &gt; 0.9985 (Zhao+ 2021) — doğada ölçülmüş en
        uç spinlerden: ISCO'da genişleme ~×10. İkisi arasındaki <b>görsel</b> farklar da gerçek fizikten gelir:
        ince diskin iç kenarı ISCO'da biter (A0620'de 2.8 r₊'da geniş karanlık boşluk; Cygnus X-1'de disk ufka
        yapışır) ve yüksek spin ışıma verimini η = 1 − E<sub>ISCO</sub> ≈ %6 → %30'a çıkarır — iç disk daha
        parlak ve beyazdır (Novikov–Thorne). Filmlerdeki "1 saat = 7 yıl" ise ancak astrofiziksel{' '}
        <b>Thorne limitinin (a* ≈ 0.998) ötesinde</b> spin + ufku sıyıran yörüngeyle mümkündür — gerçek
        deliklerde gözlenmez; genişleme kütleye değil, <b>spine ve ufka yakınlığa</b> bağlıdır.
      </div>
      <div className="fx">
        r₊ = M(1+√(1−a*²)) &nbsp;|&nbsp; disk içi = ISCO(a*) &nbsp;|&nbsp; dt/dτ|dairesel =
        (r^3/2+a)/(r^3/4·√(r^3/2−3√r+2a))
      </div>
      <div className="body">
        <b>Dürüstlük notu:</b> telemetri, saatler ve yörünge dinamiği tam Kerr'dir; görsel mercekleme shader'ı
        performans için Schwarzschild formunda kalır (uç Kerr'in asimetrik gölgesi çizilmez).
      </div>
      <div className="sect">● IŞIK BÜKÜLMESİ (MERCEKLEME)</div>
      <div className="body">
        Arka plan her karede piksel başına <b>geriye ışın izleme</b> ile çizilir: null jeodezik denklemi adaptif
        adımla entegre edilir (kaliteye göre 100–230 adım). Foton halkası, Einstein merceklemesi ve diskin ufkun
        üstünde/altında görünen arka yüzü bu denklemin doğal sonucudur — dokuya boyanmaz.
      </div>
      <div className="fx">d²x/dλ² = −(3/2) h² x / r⁵ &nbsp;&nbsp;(h: ışının özgül açısal momentumu)</div>
      <div className="sect">● DİSK IŞIMASI — İKİ MOD</div>
      <div className="body">
        <b>Gerçekçi mod</b>: gözlenen parlaklık toplam kayma faktörünün 4. kuvvetiyle ölçeklenir — I ∝ g⁴,
        g = δ·√(1−r<sub>s</sub>/r). Yaklaşan taraf <b>kat kat parlak ve mavi</b> (Doppler hüzmelemesi — M87*
        EHT görüntüsündeki asimetrinin nedeni), uzaklaşan taraf sönük ve kızıl; iç kenar kütleçekimsel kaymayla{' '}
        <b>sönükleşir</b> (Luminet 1979'daki gibi en parlak bölge iç kenar değil, yaklaşan yandır). Renk, T ∝ r
        <sup>−3/4</sup> Shakura–Sunyaev profili × g kaymasıyla kara cisim rampasından gelir — gerçek bir yıldız
        kütleli delik diski mavi-beyazdır (büyük kısmı morötesi/X-ışını). Diske pozlanmış bir kamerada yıldızlar
        görünmez — bu modda yıldızlar bu yüzden söner. <b>Sanatsal mod</b>: Interstellar'ın yaptığı tercihtir —
        Thorne ekibi kaymaları hesapladı, Nolan seyirci için simetrik sıcak paleti seçti; burada da asimetri
        yumuşatılır ve altın palet kullanılır. Disk düzlemine bırakılan cisim her iki modda da <b>plazma
        sürtünmesi</b> yaşar: E ve L gerçekten azalır, cisim ISCO'ya, oradan ufka sarmallanır. (Sürtünme
        katsayısı fenomenolojiktir; gerçek disklerde taşınımı MHD türbülansı yapar.)
      </div>
      <div className="fx">
        δ = [γ(1 + β·n̂)]⁻¹ &nbsp;|&nbsp; g = δ·√(1−r<sub>s</sub>/r) &nbsp;|&nbsp; I ∝ g⁴ (gerçekçi) · δ
        <sup>3.6</sup> (sanatsal)
      </div>
      <div className="sect">● MİMARİ &amp; PERFORMANS</div>
      <div className="body">
        <b>Tek sorumluluk</b>: Schwarzschild (tam jeodezik motor, RK4) · Simulation (dinamik) · LensedBackground
        (shader) · QualityGovernor (adaptif kalite) · React UI (yalnız 5 Hz durum aboneliği). Ekrandaki her sayı
        jeodezik durumdan (r, u<sub>r</sub>, L, E) türetilir. FPS düşerse çözünürlük ve ışın adımı kademeli iner
        ama masaüstünde <b>kalite tabanının</b> (tam çözünürlük, 150 adım) altına asla inmez — dokunmatik
        cihazlarda bir acil kademe daha vardır (0.75×, 110 adım); az bükülen uzak ışınlar analitik
        çizilir, dithering bantlaşmayı siler. 60 fps sınırı ve gizli sekmede 10 fps ile GPU uzun oturumda serin
        kalır; silinen her cismin geometri/doku belleği anında boşaltılır.
      </div>
      </div>
    </div>
  )
}
