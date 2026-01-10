document.addEventListener("DOMContentLoaded", () => {
  const sondeTypes = [
    { id: "dfm17", label: "DFM17", full: "Graw DFM17", image: "img/dfm17.jpg" },
    { id: "rs41", label: "RS41", full: "Vaisala RS41", image: "img/rs41sge.jpg" },
    { id: "m20", label: "M20", full: "Meteomodem M20", image: "img/m20.jpg" },
    { id: "m10", label: "M10", full: "Meteomodem M10", image: "img/m10.jpg" },
    { id: "imet4", label: "iMet-4", full: "InterMet iMet-4", image: "img/imet4.jpg" },
    { id: "ims100", label: "iMS-100", full: "Meisei iMS-100", image: "img/ims100.jpg" },
    { id: "imet54", label: "iMet-54", full: "InterMet iMet-54", image: "img/imet54.jpg" },
    { id: "wxr301", label: "WxR-301", full: "Weathex WxR-301", image: "img/wxr301.jpg" },
    { id: "dfm09", label: "DFM09", full: "Graw DFM09", image: "img/dfm09.jpg"},
    { id: "rs92", label: "RS92", full: "Vaisala RS92", image: "img/rs92.jpg" },
    { id: "lms6", label: "LMS6", full: "Lockheed Martin LMS6", image: "img/lms6.jpg" },
    { id: "mrz", label: "MRZ", full: "MeteoRadiy MRZ" },
    { id: "other", label: "Other", full: "Other radiosonde" }
  ];

  const typeGrid = document.getElementById("typeGrid");
  const steps = {
    2: document.getElementById("step2"),
    3: document.getElementById("step3"),
    4: document.getElementById("step4")
  };
  const step1 = document.getElementById("step1");
  const serialInput = document.getElementById("serialInput");
  const lookupBtn = document.getElementById("lookupBtn");
  const lookupStatus = document.getElementById("lookupStatus");
  const recoveryInfo = document.getElementById("recoveryInfo");
  const serialHint = document.getElementById("serialHint");
  const imetNotice = document.getElementById("imetNotice");
  const latInput = document.getElementById("latInput");
  const lonInput = document.getElementById("lonInput");
  const altInput = document.getElementById("altInput");
  const useLocationBtn = document.getElementById("useLocationBtn");
  const locationErrors = document.getElementById("locationErrors");
  const locationStatus = document.getElementById("locationStatus");
  const recoveryForm = document.getElementById("recoveryForm");
  const plannedWrapper = document.getElementById("plannedWrapper");
  const submitStatus = document.getElementById("submitStatus");
  const defaultSerialPlaceholder = "e.g. N1234567";
  const submitBtn = document.getElementById("submitBtn");

  let selectedType = null;
  let suppressSerialHint = false;
  let map;
  let marker;
  let predictionMarker;
  let sondeMarker;
  let predictionPolyline;
  let lastSondePosition = null;
  let lastPredictionPosition = null;

  function renderSondeTypes() {
    typeGrid.innerHTML = "";
    sondeTypes.forEach((type) => {
      const card = document.createElement("div");
      card.className = "sonde-card";
      card.title = type.full;
      card.dataset.id = type.id;

      if (type.image) {
        const img = document.createElement("img");
        img.src = type.image;
        img.alt = type.full;
        card.appendChild(img);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "no-image";
        placeholder.textContent = type.label;
        card.appendChild(placeholder);
      }

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = type.label;
      card.appendChild(label);

      card.addEventListener("click", (e) => {
        e.stopPropagation();
        selectType(type, card);
      });
      typeGrid.appendChild(card);
    });
  }

  async function fetchRecoveryReports(serial) {
    if (!recoveryInfo) return false;
    recoveryInfo.classList.add("hidden");
    recoveryInfo.textContent = "Checking for existing recovery reports…";
    try {
      const response = await fetch(`https://api.v2.sondehub.org/recovered?serial=${encodeURIComponent(serial)}`);
      if (!response.ok) throw new Error("No existing recovery reports found.");
      const data = await response.json();
      if (!data || (Array.isArray(data) && data.length === 0)) {
        //recoveryInfo.textContent = "No existing recovery reports found.";
        //recoveryInfo.classList.remove("hidden");
        return false;
      }
      const records = Array.isArray(data) ? data : [data];
      const lines = records.map((rec, idx) => {
        const status = rec.recovered ? "Recovered" : rec.planned ? "Planned" : "Not Recovered";
        const who = rec.recovered_by || "Unknown";
        const desc = rec.description ? `Notes: ${rec.description}` : "No notes.";
        const coords = Number.isFinite(rec.lat) && Number.isFinite(rec.lon) ? ` @ ${rec.lat.toFixed(5)}, ${rec.lon.toFixed(5)}` : "";
        const when = formatTimestamp(rec.time || rec.datetime || rec.created_at);
        const whenStr = when ? ` on ${when}` : "";
        return `${idx + 1}. ${status} by ${who}${whenStr}${coords}. ${desc}`;
      });
      recoveryInfo.textContent = `Existing recovery reports (${records.length}):\n${lines.join("\n")}`;
      recoveryInfo.classList.remove("hidden");
      return true;
    } catch (err) {
      //recoveryInfo.textContent = err.message || "No existing recovery reports found.";
      //recoveryInfo.classList.remove("hidden");
      return false;
    }
  }

  function selectType(type, card) {
    selectedType = type;
    serialInput.value = "";
    serialInput.classList.remove("input-error");
    applySerialInputFormat(type.id);
    serialInput.focus();
    updateSerialHint(type);
    lookupStatus.textContent = "Enter the serial number printed on this radiosonde.";
    lookupStatus.className = "status-line";
    if (recoveryInfo) {
      recoveryInfo.classList.add("hidden");
      recoveryInfo.textContent = "";
    }
    Object.values(steps).forEach((step) => step.classList.add("hidden"));
    steps[2].classList.remove("hidden");
    typeGrid.querySelectorAll(".sonde-card").forEach((node) => node.classList.remove("selected"));
    card.classList.add("selected");
    //serialHint.textContent = `Look for the serial on the label or casing of a ${type.full}. A diagram will appear here once available.`;
    //scrollIntoView(steps[2]);
    scrollIntoView(document.getElementById("serialInput"));
    if (step1) {
      step1.classList.add("collapsed");
    }
  }

  function showStep(stepNumber) {
    if (steps[stepNumber]) {
      steps[stepNumber].classList.remove("hidden");
      if (stepNumber === 3 && map) {
        setTimeout(() => map.invalidateSize(), 150);
      }
    }
  }

  function validateSerial(serial) {
    if (!serial) return { valid: false, message: "Please enter a serial number before looking it up." };
    if (selectedType?.id === "rs41" || selectedType?.id === "rs92") {
      const rs41Pattern = /^[A-Za-z][0-9]{7}$/;
      if (!rs41Pattern.test(serial)) {
        return { valid: false, message: "RS41/RS92 serials are one letter followed by 7 numbers (e.g. N1234567)." };
      }
    }
    if (selectedType?.id === "dfm17") {
      const dfmPattern = /^[0-9]{5}-[0-9]{6}$/;
      if (!dfmPattern.test(serial)) {
        return { valid: false, message: "DFM17 serials look like AABBB-CCCCCC (dash included)." };
      }
    }
    if (selectedType?.id === "dfm09") {
      const dfm09Pattern = /^[0-9]{6}$/;
      if (!dfm09Pattern.test(serial)) {
        return { valid: false, message: "DFM09 serials must be exactly 6 digits." };
      }
    }
    if (selectedType?.id === "m10" || selectedType?.id === "m20") {
      const m10Pattern = /^[A-Za-z0-9]{3}-[A-Za-z0-9]-[A-Za-z0-9]{5}$/;
      if (!m10Pattern.test(serial)) {
        return { valid: false, message: "M10/M20 serials look like AAA-B-CCCCC (dash included)." };
      }
    }
    if (selectedType?.id === "imet4") {
      const imetPattern = /^[A-Z0-9]{8}$/;
      if (!imetPattern.test(serial)) {
        return { valid: false, message: "iMet-4 serials must be 8 characters (numbers or uppercase letters)." };
      }
    }
    return { valid: true, message: "" };
  }

  async function lookupSerial() {
    const serial = serialInput.value.trim();
    const validation = validateSerial(serial);
    if (!validation.valid) {
      lookupStatus.textContent = validation.message;
      lookupStatus.className = "status-line error-text";
      serialInput.classList.add("input-error");
      return;
    }
    serialInput.classList.remove("input-error");
    const lookupSerialValue = normalizeSerial(serial);

    lookupStatus.textContent = `Looking up ${lookupSerialValue} in SondeHub… (This can take a while)`;
    lookupStatus.className = "status-line loading";

    let hasExistingRecovery = false;
    lastSondePosition = null;
    lastPredictionPosition = null;
    let usedTelemetry = false;
    try {
      // First try is to use the /sondes/telemetry/ API, this uses a bit less data
      // but will only work for sondes seen within the last 3 hours.
      const telemetryPosition = await fetchTelemetryPosition(lookupSerialValue);
      if (telemetryPosition) {
        setMapLocation(telemetryPosition.lat, telemetryPosition.lon, true, telemetryPosition.alt);
        lastSondePosition = telemetryPosition;
        setSondeMarker(telemetryPosition.lat, telemetryPosition.lon);
        locationStatus.textContent = "Last observed sonde position loaded from telemetry. Adjust if needed.";
        locationStatus.className = "status-line";
        usedTelemetry = true;
      }

      if (!usedTelemetry) {
        // If /sondes/telemetry fails, use /sonde/, which calls into S3
        const response = await fetch(`https://api.v2.sondehub.org/sonde/${encodeURIComponent(lookupSerialValue)}`);
        if (!response.ok) {
          throw new Error("No data returned for this serial. You can still continue.");
        }
        const data = await response.json();
        const position = extractPosition(data);
        if (position) {
          setMapLocation(position.lat, position.lon, true, position.alt);
          lastSondePosition = position;
          setSondeMarker(position.lat, position.lon);
          locationStatus.textContent = "Last observed sonde position loaded. Adjust if needed.";
          locationStatus.className = "status-line";
        } else {
          locationErrors.textContent = "Could not find this serial in the SondeHub Database. You can still enter the location manually.";
          locationErrors.className = "status-line error-text";
          useMyLocation();
        }
      }
      lookupStatus.textContent = "Lookup finished. Continue with the location below.";
      lookupStatus.className = "status-line success-text";
      hasExistingRecovery = await fetchRecoveryReports(serial);
      await fetchPrediction(lookupSerialValue);
    } catch (error) {
      lookupStatus.textContent = error.message || "Lookup failed. ";
      lookupStatus.className = "status-line error-text";
      locationErrors.textContent = "Could not find this serial in the SondeHub Database. You can still enter the location manually.";
      locationErrors.className = "status-line";
      useMyLocation();
      hasExistingRecovery = await fetchRecoveryReports(serial);
      await fetchPrediction(lookupSerialValue);
    } finally {
      showStep(3);
      showStep(4);
      ensureMap();
      map.invalidateSize();
      if (hasExistingRecovery && recoveryInfo) {
        scrollIntoView(recoveryInfo);
      } else {
        scrollIntoView(steps[3]);
      }
    }
  }

  function extractPosition(data) {
    const telemetry = Array.isArray(data?.telemetry) ? data.telemetry : null;
    const lastTelemetry = telemetry && telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;
    const candidates = [
      data,
      lastTelemetry,
      data?.latest,
      Array.isArray(data) ? data[data.length - 1] : null,
      data?.position,
      data?.locations?.[0]
    ];

    for (const entry of candidates) {
      if (!entry) continue;
      const lat = parseFloat(entry.lat ?? entry.latitude ?? entry.gps_lat ?? entry.coords?.lat);
      const lon = parseFloat(entry.lon ?? entry.longitude ?? entry.gps_lon ?? entry.coords?.lon);
      const alt = parseFloat(entry.alt ?? entry.altitude ?? entry.gps_alt ?? entry.coords?.alt);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon, alt: Number.isFinite(alt) ? alt : null };
      }
    }
    return null;
  }

  async function fetchTelemetryPosition(serial) {
    try {
      const response = await fetch(`https://api.v2.sondehub.org/sondes/telemetry?duration=3h&serial=${encodeURIComponent(serial)}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data || typeof data !== "object") return null;

      const serialKey = Object.keys(data).find((key) => typeof key === "string" && key.toUpperCase() === serial.toUpperCase());
      const telemetryEntries = serialKey ? Object.entries(data[serialKey] || {}) : [];
      if (telemetryEntries.length === 0) return null;

      const latest = telemetryEntries.reduce((current, [timestamp, record]) => {
        const timeValue = Date.parse(timestamp);
        if (!Number.isFinite(timeValue)) return current;
        if (!current || timeValue > current.timeValue) return { timeValue, record };
        return current;
      }, null);

      const latestRecord = latest?.record || telemetryEntries[telemetryEntries.length - 1][1];
      return extractPosition(latestRecord);
    } catch (error) {
      return null;
    }
  }

  function normalizeSerial(serial) {
    const trimmed = serial.trim();
    if (selectedType?.id === "dfm17") {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length >= 8) {
        const aa = digits.slice(0, 2);
        const cccccc = digits.slice(-6);
        return `${aa}${cccccc}`;
      }
    }
    return trimmed;
  }

  function applySerialInputFormat(typeId) {
    if (typeId === "dfm17") {
      serialInput.placeholder = "AABBB-CCCCCC";
      serialInput.maxLength = 12;
    } else if (typeId === "dfm09") {
      serialInput.placeholder = "6-digit serial";
      serialInput.maxLength = 6;
    } else if (typeId === "m10" || typeId === "m20") {
      serialInput.placeholder = "AAA-B-CCCCC";
      serialInput.maxLength = 11;
    } else if (typeId === "imet4") {
      serialInput.placeholder = "8 chars (A-Z, 0-9)";
      serialInput.maxLength = 8;
    } else if (typeId === "rs41" || typeId === "rs92") {
      serialInput.placeholder = defaultSerialPlaceholder;
      serialInput.maxLength = 8;
    } else {
      serialInput.placeholder = "Serial number";
      serialInput.removeAttribute("maxLength");
    }
  }

  function updateSerialHint(type) {
    if (!serialHint) return;
    if (suppressSerialHint) {
      serialHint.classList.add("hidden");
      serialHint.textContent = "";
      return;
    }
    serialHint.classList.remove("hidden");
    if (type?.id === "dfm17") {
      serialHint.innerHTML = `DFM17 serial numbers are located on a sticker on the side of the sonde. Enter the full serial number including the dash. <br><img src="img/serials/dfm17_overview.jpg" alt="DFM17 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "rs41") {
      serialHint.innerHTML = `Most RS41s have a serial on the label at the bottom of the sonde. If this is a NWS sonde, use the serial on the sensor stalk. <br><img src="img/serials/rs41_overview.jpg" alt="RS41 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "rs92") {
      serialHint.innerHTML = `RS92 serial numbers are located on a sticker at the base of the sonde. <br><img src="img/serials/rs92_overview.jpg" alt="RS92 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "m20") {
      serialHint.innerHTML = `M20 serial numbers are located on a sticker on the side of the sonde. Enter the full serial number, with a dash between each number group.<br>`;// No image yet <img src="img/serials/m20_overview.jpg" alt="M20 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "m10") {
      serialHint.innerHTML = `M10 serial numbers are located on a sticker on the side of the sonde. Enter the full serial number, with a dash between each number group.<br>`;// No image yet <img src="img/serials/m10_overview.jpg" alt="M10 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "dfm09") {
      serialHint.innerHTML = `DFM09 serial numbers are located on a sticker on the side of the sonde.<br><img src="img/serials/dfm09_overview.jpg" alt="DFM09 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "wxr301") {
      serialHint.innerHTML = `WxR-301 serial numbers are located on a sticker on the base of the sonde.<br><img src="img/serials/wxr301_overview.jpg" alt="WxR-301 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "imet54") {
      serialHint.innerHTML = `iMet-54 serial numbers are located on a sticker on the sensor stalk.<br><img src="img/serials/imet54_overview.jpg" alt="WxR-301 serial location" style="max-width: 100%; border-radius: 6px; margin-top: 8px;">`;
      return;
    }
    if (type?.id === "lms6") {
      serialHint.innerHTML = `LMS6 serial numbers are located on a sticker on base of the sonde. Look for SN followed by numbers.`;
      return;
    }
    if (type?.id === "imet4") {
      serialHint.innerHTML = `iMet radiosondes do not transmit their serial number, so Sondehub receivers generate a serial number. Check <a href="https://sondehub.org" target="_blank" rel="noreferrer">sondehub.org</a> to find the serial number the radiosonde was uploaded with.`;
      return;
    }
    const name = type?.full || "radiosonde";
    serialHint.textContent = `Look for the serial on the label or casing of a ${name}. A diagram will appear here once available.`;
  }

  function ensureMap() {
    if (map) return map;
    map = L.map("map", {
      center: [0, 0],
      zoom: 2,
      worldCopyJump: true
    });

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
    });

    L.control.layers({ "OpenStreetMap": osm, "ESRI Satellite": esri }).addTo(map);

    marker = L.marker([0, 0], { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      updateLatLonInputs(pos.lat, pos.lng);
    });
    updateLatLonInputs(0, 0);

    return map;
  }

  function setPredictionMarker(lat, lon) {
    ensureMap();
    const icon = L.divIcon({
      className: "prediction-marker",
      html: '<div class="prediction-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    if (predictionMarker) {
      predictionMarker.setLatLng([lat, lon]);
    } else {
      predictionMarker = L.marker([lat, lon], { icon }).addTo(map).bindTooltip("Predicted landing", { permanent: false });
    }
  }

  function setPredictionPolyline(track) {
    ensureMap();
    const latlngs = track.map((p) => [p.lat, p.lon]);
    if (predictionPolyline) {
      predictionPolyline.setLatLngs(latlngs);
    } else {
      predictionPolyline = L.polyline(latlngs, { color: "#00a3d3", weight: 3, opacity: 0.7 }).addTo(map);
    }
  }

  function setSondeMarker(lat, lon) {
    ensureMap();
    const icon = L.divIcon({
      className: "sonde-marker",
      html: '<div class="sonde-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    if (sondeMarker) {
      sondeMarker.setLatLng([lat, lon]);
    } else {
      sondeMarker = L.marker([lat, lon], { icon }).addTo(map).bindTooltip("Last received location", { permanent: false });
    }
  }

  function clearPredictionDisplay() {
    if (predictionMarker && map) {
      map.removeLayer(predictionMarker);
    }
    if (predictionPolyline && map) {
      map.removeLayer(predictionPolyline);
    }
    predictionMarker = null;
    predictionPolyline = null;
    lastPredictionPosition = null;
  }

  function updateLatLonInputs(lat, lon) {
    latInput.value = Number.isFinite(lat) ? lat.toFixed(5) : "";
    lonInput.value = Number.isFinite(lon) ? lon.toFixed(5) : "";
  }

  function updateAltInput(alt) {
    altInput.value = Number.isFinite(alt) ? alt.toFixed(1) : "";
  }

  function setMapLocation(lat, lon, center = false, alt = null) {
    ensureMap();
    const safeLat = Number.isFinite(lat) ? lat : 0;
    const safeLon = Number.isFinite(lon) ? lon : 0;
    marker.setLatLng([safeLat, safeLon]);
    updateLatLonInputs(safeLat, safeLon);
    if (alt !== null && Number.isFinite(alt)) {
      updateAltInput(alt);
    }
    if (center) {
      map.setView([safeLat, safeLon], 12);
    } else{
      map.panTo([safeLat, safeLon])
    }
  }

  function handleCoordinateInput() {
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    const alt = parseFloat(altInput.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      locationStatus.textContent = "Enter valid latitude and longitude values.";
      locationStatus.className = "status-line error-text";
      return;
    }
    setMapLocation(lat, lon, false, Number.isFinite(alt) ? alt : null);
    locationStatus.textContent = "Location updated from manual entry.";
    locationStatus.className = "status-line success-text";
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      locationStatus.textContent = "Geolocation is not supported in this browser.";
      locationStatus.className = "status-line error-text";
      return false;
    }

    locationStatus.textContent = "Requesting your location…";
    locationStatus.className = "status-line loading";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMapLocation(latitude, longitude, true, pos.coords.altitude ?? null);
        locationStatus.textContent = "Map set to your current location. Adjust if needed.";
        locationStatus.className = "status-line success-text";
        return true;
      },
      (err) => {
        locationStatus.textContent = `Could not get your location (${err.message}).`;
        locationStatus.className = "status-line error-text";
        return false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return true;
  }

  function preparePayload() {
    const serial = serialInput.value.trim();
    if (!selectedType) {
      return { error: "Select a radiosonde type first." };
    }
    const validation = validateSerial(serial);
    if (!validation.valid) {
      return { error: validation.message };
    }

    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    const alt = parseFloat(altInput.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { error: "Latitude and longitude are required for the report." };
    }

    const recovered = recoveryForm.recovered.value === "yes";
    const planned = !recovered && recoveryForm.planned.value === "yes";
    const name = document.getElementById("nameInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const notes = document.getElementById("notesInput").value.trim();

    if (!name) {
      return { error: "Your name or callsign is required." };
    }

    const payload = {
      recovery_software: "sondehub.org/found",
      serial: normalizeSerial(serial),
      lat,
      lon,
      alt: Number.isFinite(alt) ? alt : 0.0,
      recovered,
      planned,
      recovered_by: name,
      description: notes
    };

    if (email) {
      payload.contact_email = email;
    }

    return { payload };
  }

  async function submitRecovery(event) {
    event.preventDefault();
    const result = preparePayload();
    if (result.error) {
      submitStatus.textContent = result.error;
      submitStatus.className = "status-line error-text";
      return;
    }

    submitStatus.textContent = "Submitting recovery report to SondeHub…";
    submitStatus.className = "status-line loading";

    try {
      const response = await fetch("https://api.v2.sondehub.org/recovered", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload)
      });

      if (!response.ok) {
        const message = await safeReadError(response);
        throw new Error(message || "Failed to submit recovery report.");
      }

      submitStatus.textContent = "Reported successfully. Thank you for contributing!";
      submitStatus.className = "status-line success-text";
    } catch (err) {
      submitStatus.textContent = err.message || "Submission failed. Please try again.";
      submitStatus.className = "status-line error-text";
    }
  }

  async function safeReadError(response) {
    try {
      const data = await response.json();
      return data?.message || "";
    } catch {
      return "";
    }
  }

  function togglePlannedVisibility() {
    const recovered = recoveryForm.recovered.value === "yes";
    plannedWrapper.classList.toggle("hidden", recovered);
  }

  function scrollIntoView(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatDfmSerial(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    const first = digits.slice(0, 5);
    const last = digits.slice(5, 11);
    return last ? `${first}-${last}` : first;
  }

  function formatM10Serial(value) {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 9);
    const part1 = cleaned.slice(0, 3);
    const part2 = cleaned.slice(3, 4);
    const part3 = cleaned.slice(4, 9);
    if (part3) return `${part1}-${part2}-${part3}`;
    if (part2) return `${part1}-${part2}`;
    return part1;
  }

  function formatTimestamp(ts) {
    if (!ts) return "";
    const date = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function autoLookupFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const serialParam = params.get("serial");
    if (!serialParam) return;

    suppressSerialHint = true;

    if (!selectedType) {
      const defaultType = sondeTypes.find((t) => t.id === "rs41") || sondeTypes[0];
      const defaultCard = defaultType ? typeGrid.querySelector(`[data-id="${defaultType.id}"]`) : null;
      if (defaultType && defaultCard) {
        selectType(defaultType, defaultCard);
      }
    }

    serialInput.value = serialParam.trim();
    setTimeout(() => scrollIntoView(document.getElementById("serialInput")), 0);
    setTimeout(() => lookupSerial(), 0);
  }

  function extractPredictionPosition(resp) {
    const candidates = [];
    console.log(resp);
    if (Array.isArray(resp)) candidates.push(...resp);
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.predictions)) candidates.push(...resp.predictions);
      if (resp.data) candidates.push(resp);
      Object.values(resp).forEach((v) => {
        if (Array.isArray(v)) candidates.push(...v);
      });
    }
    console.log(candidates);

    const parseDataArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          return null;
        }
      }
      return null;
    };

    for (const entry of candidates) {
      const dataArr = parseDataArray(entry?.data) || parseDataArray(entry);
      if (Array.isArray(dataArr) && dataArr.length > 0) {
        const last = dataArr[dataArr.length - 1];
        const lat = parseFloat(last.lat ?? last.latitude);
        const lon = parseFloat(last.lon ?? last.longitude);
        const alt = parseFloat(last.alt ?? last.altitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const track = dataArr
            .map((p) => ({
              lat: parseFloat(p.lat ?? p.latitude),
              lon: parseFloat(p.lon ?? p.longitude),
              alt: parseFloat(p.alt ?? p.altitude)
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
          return { last: { lat, lon, alt: Number.isFinite(alt) ? alt : null }, track };
        }
      }
    }
    return null;
  }

  async function fetchPrediction(serial) {
    try {
      const response = await fetch(`https://api.v2.sondehub.org/predictions?vehicles=${encodeURIComponent(serial)}`);
      if (!response.ok) throw new Error("No prediction available.");
      const data = await response.json();
      const prediction = extractPredictionPosition(data);
      console.log(prediction);
      if (!prediction) return null;

      const sondeAlt = lastSondePosition?.alt;
      const predAlt = prediction.last?.alt;
      const showPrediction = Number.isFinite(sondeAlt) && Number.isFinite(predAlt) && (sondeAlt - predAlt) > 300;
      if (!showPrediction) {
        clearPredictionDisplay();
        return null;
      }

      lastPredictionPosition = prediction.last;
      setPredictionMarker(prediction.last.lat, prediction.last.lon);
      if (prediction.track.length > 1) {
        setPredictionPolyline(prediction.track);
      }

      setMapLocation(prediction.last.lat, prediction.last.lon, true, prediction.last.alt);
      locationStatus.textContent = "Using predicted landing position as default (sonde still high).";
      locationStatus.className = "status-line";
      return prediction;
    } catch (err) {
      clearPredictionDisplay();
      return null;
    }
  }

  renderSondeTypes();
  lookupBtn.addEventListener("click", lookupSerial);
  serialInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupSerial();
    }
  });
  serialInput.addEventListener("input", () => {
    if (selectedType?.id === "dfm17") {
      serialInput.value = formatDfmSerial(serialInput.value);
    } else if (selectedType?.id === "m10" || selectedType?.id === "m20") {
      serialInput.value = formatM10Serial(serialInput.value);
    }
    if (serialInput.classList.contains("input-error")) {
      const check = validateSerial(serialInput.value.trim());
      if (check.valid) {
        serialInput.classList.remove("input-error");
        lookupStatus.textContent = "Enter the serial number printed on this radiosonde.";
        lookupStatus.className = "status-line";
      }
    }
  });
  latInput.addEventListener("change", handleCoordinateInput);
  lonInput.addEventListener("change", handleCoordinateInput);
  useLocationBtn.addEventListener("click", useMyLocation);
  recoveryForm.addEventListener("submit", submitRecovery);
  Array.from(recoveryForm.recovered).forEach((input) => {
    input.addEventListener("change", togglePlannedVisibility);
  });

  togglePlannedVisibility();
  autoLookupFromQuery();
  if (step1) {
    step1.addEventListener("click", () => {
      if (step1.classList.contains("collapsed")) {
        step1.classList.remove("collapsed");
        scrollIntoView(step1);
      }
    });
  }
});
