/** FİZİK sekmesinin içeriği — dialog kabuğunu Overlay sahiplenir. */
export function PhysicsPanel() {
  return (
    <>
      <div className="sect">● UZAY-ZAMAN</div>
      <div className="body">
        Ekranda gördüğünüz hiçbir hareket elle çizilmiş animasyon değildir. Bıraktığınız her cisim, dönmeyen
        (<b>Schwarzschild</b>) bir karadeliğin büktüğü uzay-zamanda kendisine sunulan en düz yolu —{' '}
        <b>jeodeziği</b> — izler. Cismin kaderini iki korunan sayı belirler: enerjisi E ve açısal momentumu L;
        denklemler her karede adım adım çözülür (RK4). Kararlı yörüngelerin bittiği iç sınır ISCO (3 r
        <sub>s</sub>), ışığın delik çevresinde daire çizebildiği foton küresi (1.5 r<sub>s</sub>) ve E
        <sub>ISCO</sub> = √(8/9) ≈ 0.943 gibi eşikler bu çözümün kendiliğinden çıkan sonuçlarıdır — elle
        yerleştirilmez. Uzunluk birimi olay ufkunun yarıçapıdır: r = 1, geri dönüşü olmayan sınırdır.
      </div>
      <div className="fx">
        r<sub>s</sub> = 2GM/c² = 1 &nbsp;|&nbsp; (dr/dτ)² = E² − (1 − r<sub>s</sub>/r)(1 + L²/r²)
      </div>
      <div className="fx">
        d²r/dτ² = −GM/r² + L²/r³ − 3GM·L²/r⁴ &nbsp;|&nbsp; dφ/dτ = L/r²
      </div>
      <div className="sect">● ZAMAN GENİŞLEMESİ &amp; KIZILA KAYMA</div>
      <div className="body">
        Sahne, güvenli uzaklıktaki bir gözlemcinin — sizin — saatinizle akar. Deliğe yaklaşan cismin saati size
        göre gitgide yavaşlar, ışığı tırmanırken enerji kaybedip kızıllaşır. Bu yüzden hiçbir cismi ufku geçerken
        göremezsiniz: sizin saatinizle ufkun hemen üstünde <b>donar, sönükleşir ve kaybolur</b> — oysa cismin
        kendi saatinde yolculuk göz açıp kapayıncaya kadar biter. İkisi de haklıdır; görelilik tam olarak budur.
        Telemetrideki z (kızıla kayma) ve × (zaman genişlemesi) kütleçekim ve hız etkilerini birlikte taşıyan
        toplam değerlerdir; ISCO'daki dairesel yörüngede tam ×1.414 okursunuz.
      </div>
      <div className="fx">
        f ≡ 1 − r<sub>s</sub>/r &nbsp;|&nbsp; dt/dτ = E/f &nbsp;|&nbsp; v<sub>yerel</sub> = √(1 − f/E²)
        &nbsp;|&nbsp; 1 + z = E/f
      </div>
      <div className="sect">● SPAGETTİLEŞME (GELGİT KUVVETİ)</div>
      <div className="body">
        Kütleçekim, cismin deliğe bakan ucunda arka ucundakinden daha güçlüdür; bu fark cismi radyal yönde{' '}
        <b>uzatır</b>, yanlardan sıkıştırır (hacim korunur). Gelgit etkisi uzaklığın küpüyle ters orantılıdır:
        mesafe yarıya inince şiddet 8 katına çıkar — son yaklaşmanın bu kadar ani ve acımasız olması bundandır.
        Telemetrideki gradyan, serbest düşen çerçevede GR'nin verdiği tam katsayıyla hesaplanır; gövdenin
        ekrandaki uzama animasyonu bu gradyanı izleyen bir görselleştirme eğrisidir. Kopan enkazın her parçası{' '}
        <b>kendi tam jeodeziğini</b> izleyerek ufka akar.
      </div>
      <div className="fx">
        Δa = 2GM·ℓ / r³ &nbsp;(radyal, serbest düşen çerçevede GR ile birebir)
      </div>
      <div className="sect">● İKİ GERÇEK KARA DELİK (KERR)</div>
      <div className="body">
        Menüdeki iki delik hayal ürünü değil, teleskoplarla ölçülmüş gerçek nesnelerdir; dinamikleri dönen
        karadeliğin (<b>Kerr</b>) ekvatoral jeodezikleriyle çözülür (Bardeen–Press–Teukolsky 1972).{' '}
        <b>A0620-00</b>, bize en yakın bilinen karadeliklerden: 6.6 M☉ (Cantrell+ 2010) ve yavaş dönüyor (a* ≈
        0.12, Gou+ 2010) — diski ufkun epey uzağında, 2.8 r₊'da biter ve geride geniş, karanlık bir boşluk
        kalır; kararlı yörüngede zaman genişlemesi ×1.45'i geçmez. <b>Cygnus X-1</b> ise 21.2 M☉ (Miller-Jones+
        2021) ve doğada ölçülmüş en uç spinlerden birine sahip (a* &gt; 0.9985, Zhao+ 2021): dönen delik
        uzay-zamanı da beraberinde sürükler, kararlı yörüngeler ufkun dibine kadar sokulabilir — disk ufka
        yapışır, ISCO'da zaman ~×12 genişler ve maddenin ışımaya dönüşüm verimi η = 1 − E<sub>ISCO</sub> ile
        %6'dan %30'un üzerine çıkar: iç disk bu yüzden daha parlak ve beyazdır (Novikov–Thorne). Filmlerdeki
        "1 saat = 7 yıl" içinse bundan da uç bir spin (Thorne limiti a* ≈ 0.998'in ötesi) ve ufku sıyıran bir
        yörünge gerekir — genişleme kütleye değil, <b>spine ve ufka yakınlığa</b> bağlıdır.
      </div>
      <div className="fx">
        r₊ = M(1+√(1−a*²)) &nbsp;|&nbsp; disk içi = ISCO(a*) &nbsp;|&nbsp; dt/dτ|<sub>dairesel</sub> = (r
        <sup>3/2</sup>+a) / (r<sup>3/4</sup>·√(r<sup>3/2</sup>−3r<sup>1/2</sup>+2a))
      </div>
      <div className="body">
        <b>Dürüstlük notu:</b> telemetri, saatler ve yörünge dinamiği tam Kerr'dir; görsel mercekleme shader'ı
        performans için Schwarzschild formunda kalır (uç Kerr'in asimetrik gölgesi çizilmez).
      </div>
      <div className="sect">● IŞIK BÜKÜLMESİ (MERCEKLEME)</div>
      <div className="body">
        Arka plandaki her piksel için ekrandan geriye bir ışık ışını fırlatılır ve deliğin çevresinde büküle
        büküle nereden geldiği hesaplanır (<b>geriye ışın izleme</b>; kaliteye göre adaptif 100–230 adım). Foton
        halkası, arka plan yıldızlarının Einstein merceklemesi ve diskin ufkun üstünde-altında görünen
        "imkânsız" arka yüzü — hepsi bu tek denklemin doğal sonucudur, hiçbiri dokuya boyanmaz.
      </div>
      <div className="fx">d²x/dλ² = −(3/2) h² x / r⁵ &nbsp;&nbsp;(h: ışının özgül açısal momentumu)</div>
      <div className="sect">● DİSK IŞIMASI — İKİ MOD</div>
      <div className="body">
        Disk, deliğe sarmallanarak düşen kızgın gazdır ve iki modda çizilir. <b>Gerçekçi mod</b> kameraya fizik
        ne diyorsa onu gösterir: gözlenen parlaklık toplam kayma faktörünün 4. kuvvetiyle ölçeklenir (I ∝ g⁴).
        Size dönen taraf ışığını öne yığar — <b>kat kat parlak ve mavi</b> (Doppler hüzmelemesi; M87* EHT
        görüntüsündeki asimetrinin nedeni), uzaklaşan taraf sönük ve kızıldır; en parlak bölge iç kenar değil,
        yaklaşan yandır (Luminet 1979). Renk de fizikten gelir: içeri doğru ısınan gaz (T ∝ r<sup>−3/4</sup>,
        Shakura–Sunyaev) kara cisim rampasıyla mavi-beyaza kayar — gerçek bir yıldız kütleli deliğin diski o
        kadar parlaktır ki ona pozlanmış kamerada yıldızlar görünmez; bu modda yıldızların sönmesi bundandır.{' '}
        <b>Sanatsal mod</b> Interstellar'ın tercihidir: Thorne ekibi kaymaları hesapladı, Nolan seyirci için
        simetrik altın paleti seçti — burada da asimetri yumuşatılır. Her iki modda da diske bırakılan cisim{' '}
        <b>plazma sürtünmesiyle</b> gerçekten enerji kaybeder (E ve L azalır) ve ISCO'ya, oradan ufka
        sarmallanır. (Sürtünme katsayısı fenomenolojiktir; gerçek disklerde bu işi MHD türbülansı yapar.)
      </div>
      <div className="fx">
        δ = 1 / [γ(1 − β·cosθ)] &nbsp;(θ: hız–gözlemci açısı) &nbsp;|&nbsp; g = δ·√(1−r<sub>s</sub>/r)
        &nbsp;|&nbsp; I ∝ g⁴ (gerçekçi) · δ<sup>3.6</sup> (sanatsal)
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
    </>
  )
}
