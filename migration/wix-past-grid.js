/**
 * Audited visual order of every tile rendered on dreamfarmcommons.com/past.
 *
 * The Wix page keeps its text links and Pro Gallery media in unrelated DOM
 * structures, and lazy-loads most of the gallery after the initial response.
 * This manifest was recorded from the fully rendered desktop gallery instead
 * of inferring pairings from source order.
 */

const EXHIBITIONS = 'Exhibitions + Residencies';
const TALKS = 'Selected Talks + Workshops';
const EVENTS = 'Other Events';

function imageUrl(mediaFile, focus = '') {
  const focusPath = focus ? `,fp_${focus}` : '';
  return `https://static.wixstatic.com/media/${mediaFile}/v1/fill/w_526,h_526${focusPath},q_90,enc_avif,quality_auto/${mediaFile}`;
}

const records = [
  ['3 years Upstream', 'copy-of-home-2', '/copy-of-home-2', '2f24a0_23843dc4cb724c54860c490dbd072e76~mv2.jpg'],
  ['Workshop of Care & Repair', 'about-4-1', '/about-4-1', '2f24a0_a8d2d259852a419cb4a3825a7f865e02~mv2.jpg'],
  ['The World is Our Hospital', 'WorldIsOurHospital', null, '2f24a0_40bdfe389c3842a0be48f384dff77257~mv2.jpg'],
  ['Szívküldi Lakótelep: Judit Navratil', 'judit-navratil', '/judit-navratil', '2f24a0_9dbc8df4a56e42e080a9d9fd0a79d347~mv2.jpg'],
  ['Ariel Cooper', 'copy-of-right-now-2', '/copy-of-right-now-2', '2f24a0_3164b75618e942b2bfb149f722074368~mv2.jpg'],
  ['Rad Tender', 'RadT', '/ariel-cooper', '2f24a0_fc85d8c1a4a34993a2efc49af2bc1349~mv2.jpg'],
  ['Wyrm Temple', 'TW', '/copy-of-annex', '2f24a0_55400279e4834acf86951f871714b111~mv2.jpg'],
  ['Food Monument', 'FBM', '/about-1-1', '2f24a0_cc943e32bff34d0893774a175000c9c0~mv2.jpeg'],
  ['Encounters', 'Encounters', '/copy-of-rasa-1', '2f24a0_afe6ec2cb75c4c67a365aa499cc5d064~mv2.jpg'],
  ['Quinn Keck', 'QuinnKeck', '/rickys-tribune-barber-shop', '2f24a0_1047de4afcf24dbea80074536b24645f~mv2.jpeg'],
  ['Chaves Smith', 'ChavesSmith', '/copy-of-quinn-keck', '2f24a0_76261e4871024d8a9dd0d29b43abf009~mv2.jpg', '0.1_0.7'],
  ['Laura Van Duren', 'LauraVanDuren', '/copy-of-right-now-laura-van-duren', '2f24a0_da1354b5ab234085883b98eaf30c102a~mv2.jpeg'],
  ['Thinking Outside of the Box', 'ThinkingOutside', '/copy-of-rickys-tribune-barber-shop', '2f24a0_539ea06ec2a04eaaa010f132d8828ae1~mv2.jpg'],
  ['RASA', 'RASA', '/coming-soon-1', '2f24a0_fb5e4e4db2124b559801d94b1e99bb1c~mv2.jpeg'],
  ['Salt, Vessels and Tender Emissions', 'SaltVessels', '/coming-soon', '2f24a0_82f27ee937a34b168205bf6ce0d67c98~mv2.jpg'],
  ['Macrowaves', 'Macrowaves', '/copy-of-re-worlding-the-unimaginablee', '2f24a0_365339358fa84b0aa4d806ec46000821~mv2.jpeg'],
  ['More Limb Stories', 'MoreLimbStories', '/nuestra-lucha-es-por-la-vida', '2f24a0_7ff5718e521f4a59b977444894001300~mv2.jpg'],
  ['a leaf, a gourd, a shell...', 'LeafGourdShell', '/copy-of-right-now-olivia-cueva-resid', '2f24a0_ce7e822446134e2f8098313d8a9b2ddc~mv2.jpg'],
  ['All Land Is Holy', 'AllLandIsHoly', '/about-1', '2f24a0_24daf2252cfa466e90584ac5c83607c9~mv2.jpg'],
  ['Limb Stories & Other Bodily Extensions', 'LimbStories', '/copy-of-right-now-limb-stories', '2f24a0_e63b5100d3364ea8abe4b7c20f588cf8~mv2.jpg'],
  ['Kim Anno & SIGNs', 'KimAnnoSigns', '/copy-of-right-now-signs', '2f24a0_b47c6802de67471481b72e529c3881df~mv2.jpg'],
  ['Fertile Dreams', 'FertileDreams', '/copy-of-right-now-fertile-dreams', '2f24a0_06f57832e0fa44d2a6f61519cfb79097~mv2.jpg'],
  ['Jes Young AIR', 'JesYoungAir', '/copy-of-right-now-jes-young-air', '2f24a0_dfa2757d7aa24436a66577b42a203246~mv2.jpg'],
  ['Mast Year', 'MastYear', '/copy-of-right-now-alicia-escott-air', '2f24a0_43b933b4d5f54b288dd8eed372e8d105~mv2.jpg'],
  ['MOM', 'MOM', '/copy-of-right-now-mom', '2f24a0_cc5648b9da4d4e66a826e17046510b62~mv2.jpg'],
  ['TO THE NAKED', 'ToTheNaked', '/copy-of-right-now-to-the-naked-eye', '2f24a0_a794846b2d814bc3b96478d5ecd3422d~mv2.jpg'],
  ['Indigo, Cotton, Sugar, Salt, Silver, Gold', 'IndigoCotton', '/copy-of-right-now-indigo-cotton', '2f24a0_c6af7b1832944bf3bdc79c9cecfab75f~mv2.jpg'],
  ['Poetics of Desire', 'PoeticsOfDesire', null, '2f24a0_70db026c3b6540c482ee9c30db8fd13e~mv2.jpg'],
  ['Nuestra Lucha', 'NuestraLucha', '/copy-of-now-nuestra-lucha-es-por-l', '2f24a0_1853e0df077a428fbba6a27c57aa1e39~mv2.jpg'],
  ['Monuments of Memory', 'MonumentsOfMemory', '/monuments-of-memory', '2f24a0_d6d3b48f6fb14c4f9bb3082c2389d3e1~mv2.jpg'],
  ['Everything and More', 'EverythingAndMore', '/everything-and-more', '2f24a0_0d721a6c4e034ac9800afabff8835a9e~mv2.jpg'],
  ['Cat Lauigan Residency', 'CatLauigan', '/cat-lauigan-residency', '2f24a0_22e2c7a1c2f24843935e06e6f365c7ed~mv2.jpg'],
  ['Loose Ends', 'LooseEnds', '/loose-ends-tracy-ren', '2f24a0_2fa7955aedbc4d37840496b8e2c703bb~mv2.jpg'],
  ['Mickey-Me, Shipwreck and Possibility', 'MickeyMeShipwreck', '/copy-of-right-now-carissa-lillian-clark', '2f24a0_2990a58f0abf4b1396d29de2913929e4~mv2.jpg'],
  ['Dreamlines & Dirt Scars', 'DreamlinesDirtScars', null, '2f24a0_bcce17c70a5346d0bad5709c35cc79cc~mv2.jpg'],
  ['Tosha Stimage Residency', 'ToshaStimage', '/tosha-stimage-residency', '2f24a0_400ee814b014487892a33d7090c29667~mv2.jpg'],
  ['Fruitful Bodies', 'FruitfulBodies', null, '2f24a0_03854be4a6cf4b53a4dd6dc5dad4cff9~mv2.jpg'],
  ['Solar Mothers', 'SolarMothers', '/the-solar-mothers', '2f24a0_a52e1d0f59e34363a18f24a660aacd2e~mv2.jpg', '0.45_0.33'],
  ['For Democracy', 'ForDemocracy', '/right-now-for-democracy', '2f24a0_966a90e7d0cf4800b7136583d5cc2bdb~mv2.jpg'],
  ['The Future Emergent', 'TheFutureEmergent', '/right-now-future-emergent', '2f24a0_df992e8cd9be4bd19f93547add088ef0~mv2.jpg', '0.57_0.61'],
  ['Activists, Ancestors & Comrades', 'ActivistsAncestors', '/activists-ancestors-and-comrades', '2f24a0_690a712cee7f41e7b17794b151afb833~mv2.jpg'],
  ['Mail Art', 'MailArt', '/mail-art-round-3', '2f24a0_5e41edc789c440fb982b972e12a32b65~mv2.jpg'],
  ['My Hammock is your Hammock', 'MyHammock', null, '2f24a0_033e98977e7d4b0289fa4aebe7ac3db6~mv2.jpg', '0.65_0.3'],
  ['AIR: Serena JV Elston', 'copy-of-right-now-residencies', '/copy-of-right-now-residencies', '2f24a0_e3f1a17f9cdc414590c0d55ab9af53d1~mv2.jpg'],
  ['In The Neighborhood of Freedom', 'NeighborhoodOfFreedom', null, '2f24a0_540f69936465476e87638b6ce3458029~mv2.jpg'],
  ['Rad Craft + Design', 'RadCraftDesign', null, '2f24a0_81048180252847968073bac14989600b~mv2.jpg'],
  ["What's Mine Is Yours", 'WhatsMineIsYours', '/whats-mine-is-yours', '2f24a0_fd40d0236e044c6cb14e898f32bbb8d8~mv2.jpg'],
  ['Subterranean Borders', 'SubterraneanBorders', '/subterranean-borders', '2f24a0_993132956d9143bd92cb9aa12c0bb513~mv2.jpg'],
  ['The White Privilege Reading Room', 'WhitePrivilegeReadingRoom', '/the-white-privilege-research-room', '2f24a0_94e9c8db3e8c4f01b11b69dd32fd06c0~mv2.jpg', '0.46_0.4'],
  ['You Meaning Me', 'YouMeaningMe', '/you-meaning-me', '2f24a0_e0792b0acf9b41f8a4deb1553c2243e7~mv2.jpg'],
  ['The Life of a Block', 'LifeOfABloak', null, '2f24a0_0a2ab8905746465290987921d1fb5949~mv2.jpg'],
  ['Artifacts', 'Artifacts', '/artifacts', '2f24a0_cee03b19240b46229c57b74c1789800b~mv2.jpg'],
  ['Desperate Holdings', 'DesperateHoldings', '/desperate-holdings', '2f24a0_8554d71c8f4f4f4490eb6a2572bffea4~mv2.jpg'],
  ['Tipping Point', 'TippingPoint', '/tipping-point', '2f24a0_c47b664a07584ff9a76ef58fc83f769f~mv2.jpg', '0.64_0.45'],
  ['Mini Residencies', 'MiniResidencies', '/mini-residencies', '2f24a0_8ae63fef00ca45f4920664c26bf97072~mv2.jpg', '0.48_0.74'],
  ['Nègre', 'Negre', '/negre', '2f24a0_da6577c089124d86b589d87d447a0926~mv2.jpg', '0.47_0.55'],
  ['Political Birthdays', 'PoliticalBirthdays', '/political-birthdays', '2f24a0_153a252b88374d45898de12f4467e4ad~mv2.jpg'],
  ['Bloodroot', 'Bloodroot', '/bloodroot', '2f24a0_ff3e050ea3ff46d0840cb5031ed89d35~mv2.jpg', '0.4_0.4'],
  ['Radical Departures', 'RadicalDepartures', '/radical-departures', '2f24a0_cd614117e22d416cbfe4b0dc5dd4ec21~mv2.jpg', '0.5_0.87'],
  ['Body Body Body', 'BodyBodyBody', '/body-body-body', '2f24a0_a1e5fe7b702e4454ba32bd3cc6304ae7~mv2.jpg', '0.28_0.45'],

  ['Liyang Network Teach-In', 'LiyangTeachIn', '/liyang-network-teach-in', '2f24a0_b6475d4ea02c43bcb3a9db7679eed8e8~mv2.jpg'],
  ['The Witness to Witness Program', 'WitnessProgram', '/the-witness-to-witness-program', '2f24a0_f307ad293c2f4c5396bc889c7626e795~mv2.jpg'],
  ['New Horizons', 'NewHorizons', '/new-horizons', '2f24a0_de410a551f954b479b12d57d7f0d21bd~mv2.jpg'],
  ['"Object-ify" Ourselves!', 'ObjectifyOurselves', '/object-ify-ourselves', '2f24a0_4ccdebd65a1b48248cb5a72f0c558873~mv2.jpg'],
  ['Neoliberalism & Anxiety', 'NeoliberalismAnxiety', '/aesthetics-politics-neoliberalism', '2f24a0_796a42d859bc44ec9813cea302ac0e1d~mv2.jpg'],
  ['Innovator Incubator', 'InnovatorIncubator', '/innovator-incubator', '2f24a0_52ec50f779044058be99fa06a0da2e67~mv2_d_3906_3058_s_4_2.jpg', '0.71_0.28'],

  ['FORTALEZA = STRENGTH', 'Fortaleza', '/fortaleza-strength', '2f24a0_9a25938531424f3490628e619ccb483a~mv2.jpg'],
  ['4 Continents', 'FourContinents', '/4continents', '2f24a0_225ac06fd90042e39b516c700404a3c4~mv2.jpg'],
  ['Borderless Imaginary Dinner', 'BorderlessDinner', '/borderless-imaginary-dinner', '2f24a0_5b9e928f143b422eabcb48b141ada5ca~mv2.jpg'],
  ['Pop-Up Bookshop', 'PopUpBookshop', '/pop-up-bookshop', '2f24a0_e1b2dcfe112d400ab0164ec8f1fcca90~mv2.png'],
];

const tiles = records.map(([title, slug, sourcePath, mediaFile, focus], order) => ({
  order,
  category: order < 60 ? EXHIBITIONS : order < 66 ? TALKS : EVENTS,
  title,
  slug,
  source_path: sourcePath,
  media_id: mediaFile.match(/^2f24a0_[^~]+/)[0],
  source_url: imageUrl(mediaFile, focus),
}));

module.exports = { EVENTS, EXHIBITIONS, TALKS, tiles };
