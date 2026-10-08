// Tumia fallback ili kuepuka kupata undefined
  const [layout, setLayout] = useState<Record<string, number>>({
    nameX: 30.5, nameY: 30, nameSize: 7,
    phoneX: 22.5, phoneY: 28.9, phoneSize: 3,
    tinX: 76, tinY: 28.9, tinSize: 2.8,
    idTypeX: 30, idTypeY: 32.9, idTypeSize: 2.8,
    idX: 69, idY: 32.9, idSize: 2.4,
    streetX: 28, streetY: 37, streetSize: 2.8,
    wardX: 75, wardY: 37, wardSize: 2.8,
    districtX: 40, districtY: 41, districtSize: 2.8,
    regionX: 76, regionY: 41, regionSize: 2.8,
    normalX: 5.8, normalY: 56.2, normalSize: 4.2,
    deviceX: 29, deviceY: 56, deviceSize: 2.8,
    customerX: 17, customerY: 90, customerSize: 2.6,
    sign1X: 70, sign1Y: 90, sign1Size: 2.6,
    date1X: 89, date1Y: 90, date1Size: 2.2,
    salesX: 20, salesY: 93.7, salesSize: 2.6,
    sign2X: 70, sign2Y: 93.7, sign2Size: 2.6,
    date2X: 89, date2Y: 93.7, date2Size: 2.2
  });

  const ov = (x: string, y: string, size: string, width?: string): React.CSSProperties => {
    const lx = layout[x] ?? 0;
    const ly = layout[y] ?? 0;
    const lSize = layout[size] ?? 2.8;
    return {
      left: `${lx}%`,
      top: `${ly}%`,
      fontSize: `clamp(8px, ${Math.max(1.15, lSize * 0.52)}vw, 15px)`,
      width, 
      maxWidth: width, 
      boxSizing: "border-box", 
      overflow: "hidden", 
      textOverflow: "ellipsis", 
      whiteSpace: "nowrap"
    };
  };
