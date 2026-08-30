/**
 * Audited programming cycle from the live Wix homepage on 2026-08-30.
 *
 * Intentional difference from the live Wix Past page: GENIUS LOCI is added to
 * the new site's Past archive even though Wix has not added that tile yet.
 */

const hereAfterImages = [
  {
    source_url: 'https://static.wixstatic.com/media/2f24a0_69c0b8f2fe114f8fadd6ecf9ab046fc7~mv2.jpg',
    local_url: '/ImportedMedia/e7ac2e94fd70254a7107868b.jpg',
    alt: 'Screenshot 2026-08-17 at 1_edited.jpg',
    width: 466,
    height: 743,
    bytes: 153863,
    sha256: '84cdf518241211602a949f6aba7040702166148d83973adce76c6fee485789e7',
  },
  {
    source_url: 'https://static.wixstatic.com/media/2f24a0_e6d8f75e82ec494789176f619d409ee0~mv2.jpg',
    local_url: '/ImportedMedia/4769b58dd3b54d761ef54262.jpg',
    alt: 'Screenshot 2026-08-17 at 1_edited.jpg',
    width: 462,
    height: 842,
    bytes: 318996,
    sha256: '3101108b65b0bb4a0fcd99f85a9cca5d9654a39729f002fbd43f0ef12042285e',
  },
];

const hereAfterHtml = `<div class="source-content-grid" data-source-path="/hereafter">
  <section class="source-content-media source-content-media--stacked" aria-label="Here After images">
    <img src="${hereAfterImages[0].local_url}" alt="${hereAfterImages[0].alt}">
    <img src="${hereAfterImages[1].local_url}" alt="${hereAfterImages[1].alt}">
  </section>
  <article class="source-content-copy">
    <h2>Here After</h2>
    <p>Opening Saturday September 19th, 3-6pm</p>

    <p>Here After is a group show examining the Bay Area’s changing arts ecosystem, through the eyes of emerging artists. As art schools, institutions, and communities face an uncertain and rapidly shifting landscape, Here After asks: What does it mean to make art here and now - and what might come next?&nbsp;</p>

    <p>These emerging voices see the future not only in institutions but in “the artists who continue to create, gather, and imagine new ways forward.” The collection asserts that fragmentation is “a condition that allows for new forms of connection and resilience” while recognizing “the emotional fatigue that accompanies an unstable arts community.”&nbsp;</p>

    <p>Bringing together a range of practices and perspectives, the exhibition considers the relationships between art, education, community, and the systems that support creative work.</p>

    <p>Curated by Zoe Grey.</p>

    <p>Opening Reception Saturday, September 19th, 3-6</p>
    <p>Closing Reception Saturday, October 3rd, 3-6</p>

    <p><strong>Featuring artworks by:</strong></p>
    <p>Anna-Isabelle Bruey-Sedano<br>
    Asenath Lizárraga<br>
    Collin Sample<br>
    Dzigbodi “LE BohemianMuse” Djugba<br>
    Eleni Berg<br>
    eva birhanu<br>
    grace jin<br>
    Isaac Armendariz<br>
    Isai Soto<br>
    Jennifer Boyuan Han<br>
    Julio Rodriguez<br>
    Kristiana Chan 莊礼恩<br>
    Lev Keatts<br>
    Megan March<br>
    Mel Blue<br>
    Melissa Wang<br>
    Rebeca Abidaíl Flores<br>
    Samantha Maria Xóchitl Espinoza<br>
    Sierra Faust<br>
    tara k daly<br>
    Zoe Grey</p>

    <blockquote>"Above all, we have collectively experienced the ways in which we as artists make our mark as a form of remembrance, joy, anger, as evidence that we exist in all of this mess."&nbsp;</blockquote>

    <p>Image Top to Bottom</p>
    <p>Tara K Daly - Fly (brass maggot). 2026</p>
    <p>Rebeca Abidaíl Flores - Mochila Para Cuando Vamos Por Caravana/Backpack For When We Migrate. 2026</p>

    <p>Quotations drawn from artist statements by Dzigbodi “LE Bohemian Muse” Djugba, Anna-Isabelle Bruey-Sedano, Collin Sample, and Samantha Maria Xóchitl Espinoza.</p>
  </article>
</div>`;

const expectedVisibleText = `Here After
Opening Saturday September 19th, 3-6pm
Here After is a group show examining the Bay Area’s changing arts ecosystem, through the eyes of emerging artists. As art schools, institutions, and communities face an uncertain and rapidly shifting landscape, Here After asks: What does it mean to make art here and now - and what might come next?
These emerging voices see the future not only in institutions but in “the artists who continue to create, gather, and imagine new ways forward.” The collection asserts that fragmentation is “a condition that allows for new forms of connection and resilience” while recognizing “the emotional fatigue that accompanies an unstable arts community.”
Bringing together a range of practices and perspectives, the exhibition considers the relationships between art, education, community, and the systems that support creative work.
Curated by Zoe Grey.
Opening Reception Saturday, September 19th, 3-6
Closing Reception Saturday, October 3rd, 3-6
Featuring artworks by:
Anna-Isabelle Bruey-Sedano
Asenath Lizárraga
Collin Sample
Dzigbodi “LE BohemianMuse” Djugba
Eleni Berg
eva birhanu
grace jin
Isaac Armendariz
Isai Soto
Jennifer Boyuan Han
Julio Rodriguez
Kristiana Chan 莊礼恩
Lev Keatts
Megan March
Mel Blue
Melissa Wang
Rebeca Abidaíl Flores
Samantha Maria Xóchitl Espinoza
Sierra Faust
tara k daly
Zoe Grey
"Above all, we have collectively experienced the ways in which we as artists make our mark as a form of remembrance, joy, anger, as evidence that we exist in all of this mess."
Image Top to Bottom
Tara K Daly - Fly (brass maggot). 2026
Rebeca Abidaíl Flores - Mochila Para Cuando Vamos Por Caravana/Backpack For When We Migrate. 2026
Quotations drawn from artist statements by Dzigbodi “LE Bohemian Muse” Djugba, Anna-Isabelle Bruey-Sedano, Collin Sample, and Samantha Maria Xóchitl Espinoza.`;

module.exports = {
  captured_at: '2026-08-30',
  current: {
    title: 'SEA CHANGE',
    source_path: '/about-1-2',
    source_url: 'https://www.dreamfarmcommons.com/about-1-2',
  },
  future: {
    title: 'Here After',
    source_path: '/hereafter',
    source_url: 'https://www.dreamfarmcommons.com/hereafter',
    images: hereAfterImages,
    html: hereAfterHtml,
    expected_visible_text: expectedVisibleText,
  },
  past_addition: {
    slug: 'GENIUS-LOCI',
    title: 'GENIUS LOCI',
    category: 'Exhibitions + Residencies',
    source_path: '/right-now-1',
    source_url: 'https://www.dreamfarmcommons.com/right-now-1',
  },
};
