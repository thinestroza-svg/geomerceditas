"use strict";
/* GeoMerce — sistemas de coordenadas usados en Colombia, conversión a WGS84.
   Grillas urbanas MAGNA (método EPSG 1052) y Bogotá 1975 con parámetros regionales IGAC (EPSG 1597-1606). */
const CRS = (() => {
  const URBAN = [{"code": 6244, "name": "Arauca", "lat0": 7.08760639166667, "lon0": -70.7583096555555, "x0": 1035263.443, "y0": 1275526.621, "h0": 100.0}, {"code": 6245, "name": "Armenia", "lat0": 4.532325, "lon0": -75.6734891666667, "x0": 1155824.666, "y0": 993087.465, "h0": 1470.0}, {"code": 6246, "name": "Barranquilla", "lat0": 10.9231830833333, "lon0": -74.8343313333333, "x0": 917264.406, "y0": 1699839.935, "h0": 100.0}, {"code": 6247, "name": "Bogota", "lat0": 4.68048611111111, "lon0": -74.1465916666667, "x0": 92334.879, "y0": 109320.965, "h0": 2550.0}, {"code": 6248, "name": "Bucaramanga", "lat0": 7.07888714166667, "lon0": -73.1973432222222, "x0": 1097241.305, "y0": 1274642.278, "h0": 931.0}, {"code": 6249, "name": "Cali", "lat0": 3.44188333333333, "lon0": -76.5205625, "x0": 1061900.18, "y0": 872364.63, "h0": 1000.0}, {"code": 6250, "name": "Cartagena", "lat0": 10.3970475, "lon0": -75.5112069444444, "x0": 842981.41, "y0": 1641887.09, "h0": 0.0}, {"code": 6251, "name": "Cucuta", "lat0": 7.88893673611111, "lon0": -72.50287095, "x0": 842805.406, "y0": 1364404.57, "h0": 308.0}, {"code": 6252, "name": "Florencia", "lat0": 1.62101229444444, "lon0": -75.6191176027778, "x0": 1162300.348, "y0": 671068.716, "h0": 300.0}, {"code": 6253, "name": "Ibague", "lat0": 4.41941282777778, "lon0": -75.1799259333333, "x0": 877634.33, "y0": 980541.348, "h0": 1100.0}, {"code": 6254, "name": "Inirida", "lat0": 3.84543818333333, "lon0": -67.9052320888889, "x0": 1019177.687, "y0": 491791.326, "h0": 96.0}, {"code": 6255, "name": "Leticia", "lat0": -4.19768404722222, "lon0": -69.9428110583333, "x0": 25978.217, "y0": 27501.365, "h0": 89.7}, {"code": 6256, "name": "Manizales", "lat0": 5.06815388888889, "lon0": -75.5110947222222, "x0": 1173727.04, "y0": 1052391.13, "h0": 2100.0}, {"code": 6257, "name": "Medellin", "lat0": 6.22920888888889, "lon0": -75.5648869444444, "x0": 835378.647, "y0": 1180816.875, "h0": 1510.0}, {"code": 6258, "name": "Mitu", "lat0": 1.24996936666667, "lon0": -70.2354616555556, "x0": 1093717.398, "y0": 629997.236, "h0": 170.0}, {"code": 6259, "name": "Mocoa", "lat0": 1.14002335833333, "lon0": -76.6510212194444, "x0": 1047467.388, "y0": 617828.474, "h0": 655.2}, {"code": 6260, "name": "Monteria", "lat0": 8.77308575555556, "lon0": -75.8795533305556, "x0": 1131814.934, "y0": 1462131.119, "h0": 15.0}, {"code": 6261, "name": "Neiva", "lat0": 2.94241505555556, "lon0": -75.2964367222222, "x0": 864476.923, "y0": 817199.827, "h0": 430.0}, {"code": 6262, "name": "Pasto", "lat0": 1.20098951388889, "lon0": -77.2531256333333, "x0": 980469.695, "y0": 624555.332, "h0": 2530.0}, {"code": 6263, "name": "Pereira", "lat0": 4.81359361111111, "lon0": -75.6939513888889, "x0": 1153492.012, "y0": 1024195.255, "h0": 1500.0}, {"code": 6264, "name": "Popayan", "lat0": 2.45615988333333, "lon0": -76.6060916361111, "x0": 1052430.525, "y0": 763366.548, "h0": 1740.0}, {"code": 6265, "name": "Puerto Carreno", "lat0": 6.18072141388889, "lon0": -67.5007502472222, "x0": 1063834.703, "y0": 1175257.481, "h0": 51.58}, {"code": 6266, "name": "Quibdo", "lat0": 5.69424766111111, "lon0": -76.6507538583333, "x0": 1047273.617, "y0": 1121443.09, "h0": 44.0}, {"code": 6267, "name": "Riohacha", "lat0": 11.5369133277778, "lon0": -72.9027688694444, "x0": 1128154.73, "y0": 1767887.914, "h0": 6.0}, {"code": 6268, "name": "San Andres", "lat0": 12.523794325, "lon0": -81.72937595, "x0": 820439.298, "y0": 1877357.828, "h0": 6.0}, {"code": 6269, "name": "San Jose del Guaviare", "lat0": 2.56407894166667, "lon0": -72.640033325, "x0": 1159876.62, "y0": 775380.342, "h0": 185.0}, {"code": 6270, "name": "Santa Marta", "lat0": 11.2196430555556, "lon0": -74.2250052777778, "x0": 983892.409, "y0": 1732533.518, "h0": 29.0}, {"code": 6271, "name": "Sucre", "lat0": 8.81055036666667, "lon0": -74.722466825, "x0": 929043.607, "y0": 1466125.658, "h0": 20.0}, {"code": 6272, "name": "Tunja", "lat0": 5.53419473888889, "lon0": -73.3519389, "x0": 1080514.91, "y0": 1103772.028, "h0": 2800.0}, {"code": 6273, "name": "Valledupar", "lat0": 10.4472611111111, "lon0": -73.2465713888889, "x0": 1090979.66, "y0": 1647208.93, "h0": 200.0}, {"code": 6274, "name": "Villavicencio", "lat0": 4.1553751, "lon0": -73.6244859861111, "x0": 1050678.757, "y0": 950952.124, "h0": 427.19}, {"code": 6275, "name": "Yopal", "lat0": 5.35392722222222, "lon0": -72.4200402777778, "x0": 851184.177, "y0": 1083954.137, "h0": 300.0}];
  const BOG = {"1": {"x": 307.0, "y": 304.0, "z": -318.0}, "10": {"x": 221.899, "y": 274.136, "z": -397.554, "rx": 2.80844591036278, "ry": -0.44850858891268, "rz": -2.81017234679107, "s": -2.199943}, "9": {"x": -305.356, "y": 222.004, "z": -30.023, "rx": -9.69049385992583, "ry": 1.03196819622539, "rz": -19.7573941768278, "s": 6.325747}, "7": {"x": -90.29, "y": 247.559, "z": -21.989, "rx": -8.69688534851263, "ry": -4.18803362841004, "rz": -12.8082668496251, "s": 2.181658}, "6": {"x": 963.273, "y": 486.386, "z": 190.997, "rx": -16.4850360280866, "ry": -1.66882584284416, "rz": 21.6928490465265, "s": -13.89914}, "4": {"x": 100.783, "y": 187.382, "z": -47.0, "rx": -9.22383004903209, "ry": 2.42380329967319, "rz": -8.30827832824698, "s": -13.56561}, "8": {"x": -0.562, "y": 244.299, "z": -456.938, "rx": 6.8668709851194, "ry": -8.25267346177889, "rz": -9.2967797230575, "s": 3.74656}, "3": {"x": -806.413, "y": -263.5, "z": -622.671, "rx": 12.4142185637707, "ry": -2.99084175323096, "rz": -39.0346863906349, "s": -20.81616}, "5": {"x": 336.026, "y": 348.565, "z": 252.978, "rx": -17.2412894390071, "ry": -6.30649282215535, "rz": 1.56204977191825, "s": -5.771909}, "2": {"x": 304.5, "y": 306.5, "z": -318.1}};
  const TM = (lat0, lon0, ell) => '+proj=tmerc +lat_0=' + lat0 + ' +lon_0=' + lon0 + ' +k=1 +x_0=1000000 +y_0=1000000 +ellps=' + ell + ' +units=m +no_defs';
  const MAG = '4.59620041666667', BOGLAT = '4.59904722222222';
  const LIST = [
    { id: '9377', group: 'Más usados', name: 'CTM12 · Origen Nacional (EPSG 9377)', def: '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs' },
    { id: '6257', group: 'Más usados', name: 'MAGNA Medellín · cartesiana (EPSG 6257)', urban: 6257 },
    { id: '3116', group: 'Más usados', name: 'MAGNA Origen Bogotá (EPSG 3116)', def: TM(MAG, '-74.0775079166667', 'GRS80') },
    { id: '3115', group: 'Más usados', name: 'MAGNA Origen Oeste (EPSG 3115)', def: TM(MAG, '-77.0775079166667', 'GRS80') },
    { id: '4326', group: 'Más usados', name: 'WGS84 / MAGNA geográficas (latitud, longitud)', geo: true },
    { id: '3114', group: 'MAGNA-SIRGAS Gauss-Krüger', name: 'MAGNA Origen Oeste-Oeste (EPSG 3114)', def: TM(MAG, '-80.0775079166667', 'GRS80') },
    { id: '3117', group: 'MAGNA-SIRGAS Gauss-Krüger', name: 'MAGNA Origen Este Central (EPSG 3117)', def: TM(MAG, '-71.0775079166667', 'GRS80') },
    { id: '3118', group: 'MAGNA-SIRGAS Gauss-Krüger', name: 'MAGNA Origen Este-Este (EPSG 3118)', def: TM(MAG, '-68.0775079166667', 'GRS80') },
    { id: '32618', group: 'WGS84 UTM', name: 'WGS84 UTM zona 18N (EPSG 32618)', def: '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs' },
    { id: '32617', group: 'WGS84 UTM', name: 'WGS84 UTM zona 17N (EPSG 32617)', def: '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs' },
    { id: '32619', group: 'WGS84 UTM', name: 'WGS84 UTM zona 19N (EPSG 32619)', def: '+proj=utm +zone=19 +datum=WGS84 +units=m +no_defs' },
    { id: '21897', group: 'Datum Bogotá 1975 (planos antiguos)', name: 'Bogotá 1975 · Origen Bogotá (EPSG 21897)', bog: TM(BOGLAT, '-74.0809166666667', 'intl') },
    { id: '21896', group: 'Datum Bogotá 1975 (planos antiguos)', name: 'Bogotá 1975 · Origen Oeste (EPSG 21896)', bog: TM(BOGLAT, '-77.0809166666667', 'intl') },
    { id: '21898', group: 'Datum Bogotá 1975 (planos antiguos)', name: 'Bogotá 1975 · Origen Este Central (EPSG 21898)', bog: TM(BOGLAT, '-71.0809166666667', 'intl') },
    { id: '21899', group: 'Datum Bogotá 1975 (planos antiguos)', name: 'Bogotá 1975 · Origen Este (EPSG 21899)', bog: TM(BOGLAT, '-68.0809166666667', 'intl') }
  ];
  for (const u of URBAN) if (u.code !== 6257) LIST.push({ id: String(u.code), group: 'MAGNA cartesianas (grillas urbanas)', name: 'MAGNA ' + u.name + ' · cartesiana (EPSG ' + u.code + ')', urban: u.code });

  /* Grilla urbana de Colombia (EPSG 1052) */
  const a = 6378137, f = 1 / 298.257222101, es = 2 * f - f * f, R = Math.PI / 180;
  const U = {};
  for (const u of URBAN) {
    const phi0 = u.lat0 * R, s0 = Math.sin(phi0), nu0 = 1 / Math.sqrt(1 - es * s0 * s0), rho0 = (1 - es) / Math.pow(1 - es * s0 * s0, 1.5), h0 = u.h0 / a;
    U[u.code] = { phi0, lam0: u.lon0 * R, x0: u.x0, y0: u.y0, h0, A: 1 + h0 / nu0, B: Math.tan(phi0) / (2 * rho0 * nu0) };
  }
  function urbanFwd(code, lat, lon) {
    const p = U[code], phi = lat * R, lam = lon * R - p.lam0, s = Math.sin(phi);
    const nu = 1 / Math.sqrt(1 - es * s * s), L = lam * nu * Math.cos(phi);
    const sm = Math.sin(0.5 * (phi + p.phi0)), rhom = (1 - es) / Math.pow(1 - es * sm * sm, 1.5);
    const x = p.A * L, y = (1 + p.h0 / rhom) * rhom * (phi - p.phi0) + p.B * L * L;
    return [p.x0 + a * x, p.y0 + a * y];
  }
  function urbanInv(code, E, N) {
    const p = U[code]; let lat = p.phi0 / R + (N - p.y0) / 111000, lon = p.lam0 / R + (E - p.x0) / 111000;
    for (let i = 0; i < 20; i++) {
      const [e0, n0] = urbanFwd(code, lat, lon), d = 1e-6;
      const [e1, n1] = urbanFwd(code, lat + d, lon), [e2, n2] = urbanFwd(code, lat, lon + d);
      const j11 = (e1 - e0) / d, j12 = (e2 - e0) / d, j21 = (n1 - n0) / d, j22 = (n2 - n0) / d, det = j11 * j22 - j12 * j21;
      const de = E - e0, dn = N - n0;
      const dlat = (j22 * de - j12 * dn) / det, dlon = (-j21 * de + j11 * dn) / det;
      lat += dlat; lon += dlon;
      if (Math.abs(dlat) + Math.abs(dlon) < 1e-11) break;
    }
    return [lat, lon];
  }
  /* Región IGAC para Bogotá 1975 */
  function bogRegion(lat, lon) {
    if (lat > 9.8 && lon > -73) return 3;
    if (lat > 9.4 && lon <= -73) return 4;
    if (lon <= -74.4) { if (lat >= 8) return 5; if (lat >= 5) return 7; if (lat >= 3) return 8; }
    if (lat < 3 && lon <= -74) return 9;
    if (lat >= 5 && lat <= 9.4 && lon > -74.4 && lon <= -72) return 6;
    if (lon > -74.4 && lat < 5) return 10;
    return 1;
  }
  function bogToWGS(def, E, N) {
    const [lon1, lat1] = proj4(def, '+proj=longlat +ellps=intl +no_defs', [E, N]);
    const p = BOG[bogRegion(lat1, lon1)] || BOG[1];
    const tw = [p.x, p.y, p.z, -(p.rx || 0), -(p.ry || 0), -(p.rz || 0), p.s || 0].join(',');
    const [lon, lat] = proj4('+proj=longlat +ellps=intl +towgs84=' + tw + ' +no_defs', 'WGS84', [lon1, lat1]);
    return [lat, lon];
  }
  const byId = id => LIST.find(c => c.id === String(id));
  function toWGS(id, x, y) {
    const c = byId(id); if (!c) throw new Error('Sistema desconocido');
    if (c.geo) return [x, y];
    if (c.urban) return urbanInv(c.urban, x, y);
    if (c.bog) return bogToWGS(c.bog, x, y);
    const [lon, lat] = proj4(c.def, 'WGS84', [x, y]); return [lat, lon];
  }
  function fromWGS(id, lat, lon) {
    const c = byId(id);
    if (c.geo) return [lat, lon];
    if (c.urban) return urbanFwd(c.urban, lat, lon);
    if (c.bog) { const tw = (() => { const p = BOG[bogRegion(lat, lon)] || BOG[1]; return [p.x, p.y, p.z, -(p.rx || 0), -(p.ry || 0), -(p.rz || 0), p.s || 0].join(','); })(); return proj4('+proj=longlat +ellps=intl +no_defs', c.bog, proj4('WGS84', '+proj=longlat +ellps=intl +towgs84=' + tw + ' +no_defs', [lon, lat])); }
    return proj4('WGS84', c.def, [lon, lat]);
  }
  return { LIST, byId, toWGS, fromWGS };
})();
