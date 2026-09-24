let videoElement, btnCamara, textoCamara;
let canvasOpenCV, ctxOpenCV, statusAlucinacion;
let canvasMediaPipe, ctxMediaPipe;
let contenedorThree;

const ANCHO = 320;
const ALTO = 240;

let nivelAlucinacion = 0;
let contadorQuietud = 0;
let frameAnteriorGris = null;
let camaraActiva = false;
let streamCamara = null;

let canvasAux = document.createElement('canvas');
canvasAux.width = ANCHO;
canvasAux.height = ALTO;
let ctxAux = canvasAux.getContext('2d', { willReadFrequently: true });

let escalaObjeto3D = 1.0;
let posicionObjeto3D = { x: 0, y: 0 };
let landmarksManoActual = null;

const imagenInactiva = new Image();
imagenInactiva.src = 'inactiva.jpg';
let texturaInactivaThree = null;

let scene, camera, renderer, objeto3D, videoTexture, videoMesh;
let lineaDedosGeo, lineaDedosMat, lineaDedosMesh;

function iniciarThreeJS() {
  try {
    contenedorThree = document.getElementById('contenedor-threejs');
    if (!contenedorThree) return;
    contenedorThree.innerHTML = '';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);

    camera = new THREE.PerspectiveCamera(50, ANCHO / ALTO, 0.1, 1000);
    camera.position.set(0, 0, 3.5);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(ANCHO, ALTO);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    contenedorThree.appendChild(renderer.domElement);

    videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;

    texturaInactivaThree = new THREE.Texture(imagenInactiva);
    texturaInactivaThree.minFilter = THREE.LinearFilter;
    texturaInactivaThree.magFilter = THREE.LinearFilter;

    const planeGeo = new THREE.PlaneGeometry(6.4, 4.8);
    const planeMat = new THREE.MeshBasicMaterial({ map: texturaInactivaThree, side: THREE.DoubleSide });
    
    videoMesh = new THREE.Mesh(planeGeo, planeMat);
    videoMesh.position.set(0, 0, -1.5);
    videoMesh.scale.set(-1, 1, 1);
    videoMesh.visible = true;
    scene.add(videoMesh);

    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
    const luzDireccional = new THREE.DirectionalLight(0x00f0ff, 4.0);
    luzDireccional.position.set(5, 5, 5);
    scene.add(luzDireccional);

    objeto3D = new THREE.Group();
    objeto3D.visible = false;
    scene.add(objeto3D);

    const puntosLinea = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)];
    lineaDedosGeo = new THREE.BufferGeometry().setFromPoints(puntosLinea);
    lineaDedosMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3 });
    lineaDedosMesh = new THREE.Line(lineaDedosGeo, lineaDedosMat);
    lineaDedosMesh.visible = false;
    scene.add(lineaDedosMesh);

    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
      const loader = new THREE.GLTFLoader();
      loader.load('figura.glb', (gltf) => {
        const modeloCargado = gltf.scene;
        modeloCargado.scale.set(0.6, 0.6, 0.6);
        modeloCargado.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0x00f0ff, roughness: 0.15, metalness: 0.85, emissive: 0x002244, emissiveIntensity: 0.3
            });
          }
        });
        objeto3D.add(modeloCargado);
      });
    }
    renderer.render(scene, camera);
  } catch (e) {}
}

function actualizarThreeJS() {
  try {
    if (camaraActiva) {
      if (videoMesh && videoMesh.material.map !== videoTexture) {
        videoMesh.material.map = videoTexture;
        videoMesh.material.needsUpdate = true;
      }
      if (videoTexture) videoTexture.needsUpdate = true;
      if (videoMesh) videoMesh.visible = true;
      if (objeto3D) {
        objeto3D.visible = true;
        objeto3D.rotation.y += 0.02;
        objeto3D.scale.set(escalaObjeto3D, escalaObjeto3D, escalaObjeto3D);
        objeto3D.position.set(posicionObjeto3D.x, posicionObjeto3D.y, 0);
      }
      if (landmarksManoActual && lineaDedosMesh) {
        const pulgar = landmarksManoActual[4], indice = landmarksManoActual[8];
        const p1 = new THREE.Vector3((pulgar.x - 0.5) * -3.0, -(pulgar.y - 0.5) * 2.2, 0);
        const p2 = new THREE.Vector3((indice.x - 0.5) * -3.0, -(indice.y - 0.5) * 2.2, 0);
        const posiciones = lineaDedosGeo.attributes.position.array;
        posiciones[0] = p1.x; posiciones[1] = p1.y; posiciones[2] = p1.z;
        posiciones[3] = p2.x; posiciones[4] = p2.y; posiciones[5] = p2.z;
        lineaDedosGeo.attributes.position.needsUpdate = true;
        lineaDedosMesh.visible = true;
      } else if (lineaDedosMesh) { lineaDedosMesh.visible = false; }
    } else {
      if (videoMesh && videoMesh.material.map !== texturaInactivaThree) {
        videoMesh.material.map = texturaInactivaThree;
        texturaInactivaThree.needsUpdate = true;
        videoMesh.material.needsUpdate = true;
      }
      if (videoMesh) videoMesh.visible = true;
      if (objeto3D) objeto3D.visible = false;
      if (lineaDedosMesh) lineaDedosMesh.visible = false;
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
  } catch (e) {}
}

let manosMediaPipe = null;
let procesandoMano = false;
window.targetIntensidadMalla = 0;
window.intensidadMalla = 0;

function dist3D(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
}

function esGestoMarco(mano) {
  const muneca = mano[0];
  return dist3D(mano[8], muneca) > dist3D(mano[6], muneca) &&
         dist3D(mano[4], muneca) > dist3D(mano[3], muneca) &&
         dist3D(mano[12], muneca) < dist3D(mano[10], muneca) &&
         dist3D(mano[16], muneca) < dist3D(mano[14], muneca) &&
         dist3D(mano[20], muneca) < dist3D(mano[18], muneca);
}

function esPuñoParcial(mano) {
  const muneca = mano[0];
  return dist3D(mano[12], muneca) < dist3D(mano[10], muneca) &&
         dist3D(mano[16], muneca) < dist3D(mano[14], muneca) &&
         dist3D(mano[20], muneca) < dist3D(mano[18], muneca);
}

function configurarMediaPipeHands() {
  if (typeof Hands !== 'undefined') {
    manosMediaPipe = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    manosMediaPipe.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    manosMediaPipe.onResults((results) => {
      procesandoMano = false;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        landmarksManoActual = results.multiHandLandmarks[0];
        
        const pulgar = landmarksManoActual[4], indice = landmarksManoActual[8];
        const distanciaDedos = Math.sqrt(Math.pow(pulgar.x - indice.x, 2) + Math.pow(pulgar.y - indice.y, 2) + Math.pow(pulgar.z - indice.z, 2));
        escalaObjeto3D = Math.min(Math.max(distanciaDedos * 3.5, 0.2), 1.8);

        if (esPuñoParcial(landmarksManoActual) && distanciaDedos < 0.12) {
          posicionObjeto3D.x = (0.5 - landmarksManoActual[9].x) * 4.0;
          posicionObjeto3D.y = (0.5 - landmarksManoActual[9].y) * 3.0;
        }

        if (results.multiHandLandmarks.length >= 2) {
          if (esGestoMarco(results.multiHandLandmarks[0]) && esGestoMarco(results.multiHandLandmarks[1])) {
            const aperturaMarco = (dist3D(results.multiHandLandmarks[0][8], results.multiHandLandmarks[1][4]) + dist3D(results.multiHandLandmarks[0][4], results.multiHandLandmarks[1][8])) / 2;
            window.targetIntensidadMalla = Math.min(Math.max((aperturaMarco - 0.05) / 0.30, 0.0), 1.0);
          } else { window.targetIntensidadMalla = 0; }
        } else { window.targetIntensidadMalla = 0; }
      } else {
        landmarksManoActual = null;
        window.targetIntensidadMalla = 0;
      }
    });
  }
}

function procesarBarreraCuerpo() {
  if (!camaraActiva || videoElement.readyState !== 4) {
    window.targetIntensidadMalla = 0;
    window.intensidadMalla = 0;
    if (imagenInactiva.complete && imagenInactiva.naturalHeight !== 0) {
      ctxMediaPipe.drawImage(imagenInactiva, 0, 0, ANCHO, ALTO);
    } else {
      ctxMediaPipe.fillStyle = '#050811';
      ctxMediaPipe.fillRect(0, 0, ANCHO, ALTO);
    }
    return;
  }

  if (manosMediaPipe && !procesandoMano && videoElement.readyState === 4) {
    procesandoMano = true;
    manosMediaPipe.send({ image: videoElement }).catch(() => { procesandoMano = false; });
  }

  ctxMediaPipe.fillStyle = '#050811';
  ctxMediaPipe.fillRect(0, 0, ANCHO, ALTO);
  ctxMediaPipe.save();
  ctxMediaPipe.scale(-1, 1);
  ctxMediaPipe.drawImage(videoElement, -ANCHO, 0, ANCHO, ALTO);
  ctxMediaPipe.restore();

  window.intensidadMalla += (window.targetIntensidadMalla - window.intensidadMalla) * 0.08;

  if (window.intensidadMalla > 0.01) {
    try {
      ctxAux.drawImage(videoElement, 0, 0, ANCHO, ALTO);
      let frameData = ctxAux.getImageData(0, 0, ANCHO, ALTO);
      let data = frameData.data;

      ctxMediaPipe.save();
      ctxMediaPipe.scale(-1, 1);
      ctxMediaPipe.globalAlpha = window.intensidadMalla;

      for (let y = 15; y < ALTO - 10; y += 6) {
        let minX = ANCHO, maxX = 0;
        for (let x = 15; x < ANCHO - 15; x += 5) {
          let idx = (y * ANCHO + x) * 4;
          let brillo = (data[idx] + data[idx+1] + data[idx+2]) / 3;
          if (brillo > 45 && brillo < 230) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        if (maxX > minX) {
          for (let x = minX; x <= maxX; x += 8) {
            let idx = (y * ANCHO + x) * 4;
            let brillo = (data[idx] + data[idx+1] + data[idx+2]) / 3;
            ctxMediaPipe.shadowBlur = 10 * window.intensidadMalla;
            ctxMediaPipe.shadowColor = brillo > 140 ? '#ffea00' : '#00f0ff';
            ctxMediaPipe.fillStyle = ctxMediaPipe.shadowColor;
            ctxMediaPipe.beginPath();
            ctxMediaPipe.arc(-x, y, 4.5 * (0.4 + (0.6 * window.intensidadMalla)), 0, 2 * Math.PI);
            ctxMediaPipe.fill();
          }
        }
      }
      ctxMediaPipe.restore();
    } catch (e) {}
  }
}

function procesarOpenCV() {
  if (!camaraActiva || videoElement.readyState !== 4) {
    if (statusAlucinacion) statusAlucinacion.innerText = `Distorsión: 0%`;
    if (imagenInactiva.complete && imagenInactiva.naturalHeight !== 0) {
      ctxOpenCV.drawImage(imagenInactiva, 0, 0, ANCHO, ALTO);
    } else {
      ctxOpenCV.fillStyle = '#050811';
      ctxOpenCV.fillRect(0, 0, ANCHO, ALTO);
    }
    return;
  }

  ctxOpenCV.save();
  ctxOpenCV.scale(-1, 1);
  ctxOpenCV.drawImage(videoElement, -ANCHO, 0, ANCHO, ALTO);
  ctxOpenCV.restore();

  let nivel = 0;
  try {
    let canvasTemp = document.createElement('canvas');
    canvasTemp.width = ANCHO; canvasTemp.height = ALTO;
    let ctxTemp = canvasTemp.getContext('2d', { willReadFrequently: true });
    ctxTemp.drawImage(videoElement, 0, 0, ANCHO, ALTO);
    let imgData = ctxTemp.getImageData(0, 0, ANCHO, ALTO);
    let sumaMovimiento = 0;

    if (frameAnteriorGris) {
      let pixelesComparados = 0;
      for (let i = 0; i < imgData.data.length; i += 16) {
        let lumaActual = (imgData.data[i] * 0.299 + imgData.data[i+1] * 0.587 + imgData.data[i+2] * 0.114);
        let lumaAnterior = (frameAnteriorGris[i] * 0.299 + frameAnteriorGris[i+1] * 0.587 + frameAnteriorGris[i+2] * 0.114);
        sumaMovimiento += Math.abs(lumaActual - lumaAnterior);
        pixelesComparados++;
      }
      if ((sumaMovimiento / pixelesComparados) > 4.5) { contadorQuietud = 0; }
      else { contadorQuietud++; }
    }
    frameAnteriorGris = new Uint8ClampedArray(imgData.data);

    if (contadorQuietud > 15) {
      nivel = Math.min((contadorQuietud - 15) / (300 - 15), 1.0);
    }
    if (statusAlucinacion) { statusAlucinacion.innerText = `Distorsión: ${Math.round(nivel * 100)}%`; }
  } catch (e) {}

  if (nivel > 0) {
    try {
      const imgData = ctxOpenCV.getImageData(0, 0, ANCHO, ALTO);
      const data = imgData.data;
      const copiaOriginal = new Uint8ClampedArray(data);
      const tiempo = Date.now() * 0.001;
      const centroX = ANCHO / 2;
      const centroY = ALTO / 2;

      for (let y = 0; y < ALTO; y++) {
        for (let x = 0; x < ANCHO; x++) {
          let xOrigen = x, yOrigen = y;
          let fuerzaRespiracion = nivel * 0.08 * Math.sin(tiempo * 1.5);
          xOrigen = x - ((x - centroX) * fuerzaRespiracion);
          yOrigen = y - ((y - centroY) * fuerzaRespiracion);

          if (nivel > 0.3) {
             let intensidadOnda = ((nivel - 0.3) / 0.7) * 20;
             xOrigen += Math.sin(yOrigen * 0.05 + tiempo * 3) * intensidadOnda;
             yOrigen += Math.cos(xOrigen * 0.04 + tiempo * 2) * (intensidadOnda * 0.5);
          }

          xOrigen = Math.min(Math.max(xOrigen, 0), ANCHO - 1);
          yOrigen = Math.min(Math.max(yOrigen, 0), ALTO - 1);

          let desfaseCrom = nivel > 0.15 ? ((nivel - 0.15) / 0.85) * 15 : 0;
          const xR = Math.min(Math.max(Math.floor(xOrigen + desfaseCrom), 0), ANCHO - 1);
          const xB = Math.min(Math.max(Math.floor(xOrigen - desfaseCrom), 0), ANCHO - 1);
          const xO = Math.floor(xOrigen);
          const yO = Math.floor(yOrigen);

          const iTarget = (y * ANCHO + x) * 4;
          data[iTarget]     = copiaOriginal[(yO * ANCHO + xR) * 4];
          data[iTarget + 1] = copiaOriginal[(yO * ANCHO + xO) * 4 + 1];
          data[iTarget + 2] = copiaOriginal[(yO * ANCHO + xB) * 4 + 2];
        }
      }
      ctxOpenCV.putImageData(imgData, 0, 0);
    } catch (e) {}
  }
}

async function toggleCamara() {
  if (!camaraActiva) {
    try {
      streamCamara = await navigator.mediaDevices.getUserMedia({ video: { width: ANCHO, height: ALTO } });
      videoElement.srcObject = streamCamara;
      await videoElement.play();
      camaraActiva = true;
      if (btnCamara.querySelector('span')) btnCamara.querySelector('span').innerText = 'stop';
      if (textoCamara) textoCamara.innerText = 'STATUS: CÁMARA ACTIVA';
    } catch (err) {
      if (textoCamara) textoCamara.innerText = 'STATUS: PERMISO DENEGADO';
    }
  } else {
    if (streamCamara) streamCamara.getTracks().forEach(track => track.stop());
    camaraActiva = false;
    if (btnCamara.querySelector('span')) btnCamara.querySelector('span').innerText = 'start';
    if (textoCamara) textoCamara.innerText = 'STATUS: CÁMARA INACTIVA';
    escalaObjeto3D = 1.0;
    posicionObjeto3D = { x: 0, y: 0 };
    landmarksManoActual = null;
    videoElement.srcObject = null;
    procesarOpenCV();
    procesarBarreraCuerpo();
  }
}

function crearVentanaReflexion() {
  if (document.getElementById('ventana-reflexion')) return;

  const ventana = document.createElement('div');
  ventana.id = 'ventana-reflexion';
  ventana.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 650px;
    max-height: 80vh;
    background: #ece9d8;
    border: 2px solid #0054e3;
    box-shadow: 4px 4px 15px rgba(0,0,0,0.4);
    z-index: 10000;
    font-family: Tahoma, sans-serif;
    display: flex;
    flex-direction: column;
    border-radius: 6px 6px 0 0;
    overflow: hidden;
  `;

  const barraTitulo = document.createElement('div');
  barraTitulo.style.cssText = `
    background: linear-gradient(to right, #0054e3 0%, #a3c5ff 100%);
    color: white;
    padding: 6px 10px;
    font-weight: bold;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  barraTitulo.innerHTML = `
    <span>📖 Reflexión - Las Puertas de la Percepción (Aldous Huxley)</span>
    <button id="cerrar-reflexion" style="background: #e81123; color: white; border: none; width: 20px; height: 20px; font-weight: bold; cursor: pointer; border-radius: 3px;">X</button>
  `;

  const contenido = document.createElement('div');
  contenido.style.cssText = `
    padding: 25px;
    overflow-y: auto;
    background: #ffffff;
    color: #111;
    font-size: 16px;
    line-height: 1.6;
    max-height: calc(80vh - 40px);
  `;
  
  contenido.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 20px; color: #0054e3; font-size: 20px; text-align: center;">Reflexión</h3>
    
    <p style="margin-bottom: 15px;">Cada individuo tiene una percepción de la realidad distinta a la de los demás, moldeada por sus experiencias físicas y emocionales, su contexto y su visión del mundo. Por más vivencias que compartamos con otras personas, nuestra percepción nunca es idéntica; construimos nuestro propio sistema para entender lo que nos rodea. Esto ocurre a través de nuestros sentidos el tacto, el oído, el gusto, el olfato y la vista, así como de la consciencia y la interpretación que hacemos de ellos.</p>
    
    <p style="margin-bottom: 15px;">Pero, ¿qué pasaría si estos sistemas de percepción no pertenecieran a un ser humano?</p>
    
    <p style="margin-bottom: 15px;">Multirealidades presenta tres sistemas que utilizan un mismo medio para recibir información: la cámara, pero la interpretan de tres maneras completamente distintas. Cada uno de estos sistemas es capaz de captar elementos que los demás omiten, entregando perspectivas y resultados únicos. Son datos que nosotros, por nuestra naturaleza, no lograríamos descifrar, pero que esta interfaz nos permite finalmente visualizar.</p>
    
    <p style="margin-bottom: 25px;">Estos tres sistemas actúan como una puerta a realidades que comúnmente omitimos, brindándole un medio para manifestarse a aquello que nuestros sentidos biológicos filtran.</p>
    
    <div style="padding-left: 15px; border-left: 4px solid #0054e3;">
      <p style="font-style: italic; margin-bottom: 8px;">"El cerebro puede actuar como una 'válvula reductora', filtrando la vastedad de la conciencia, lo que nos permite funcionar en la vida diaria".</p>
      <p style="font-style: italic; margin: 0; color: #555;">— Huxley, A. (1954). Las puertas de la percepción.</p>
    </div>
  `;

  ventana.appendChild(barraTitulo);
  ventana.appendChild(contenido);
  document.body.appendChild(ventana);

  document.getElementById('cerrar-reflexion').addEventListener('click', () => {
    ventana.remove();
  });
}

function crearVentanaTecnologias() {
  if (document.getElementById('ventana-tecnologias')) return;

  const ventana = document.createElement('div');
  ventana.id = 'ventana-tecnologias';
  ventana.style.cssText = `
    position: fixed;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    width: 550px;
    background: #ece9d8;
    border: 2px solid #0054e3;
    box-shadow: 4px 4px 15px rgba(0,0,0,0.4);
    z-index: 10001;
    font-family: Tahoma, sans-serif;
    display: flex;
    flex-direction: column;
    border-radius: 6px 6px 0 0;
    overflow: hidden;
  `;

  const barraTitulo = document.createElement('div');
  barraTitulo.style.cssText = `
    background: linear-gradient(to right, #0054e3 0%, #a3c5ff 100%);
    color: white;
    padding: 6px 10px;
    font-weight: bold;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  barraTitulo.innerHTML = `
    <span>⚙️ Programas y Tecnologías</span>
    <button id="cerrar-tecnologias" style="background: #e81123; color: white; border: none; width: 20px; height: 20px; font-weight: bold; cursor: pointer; border-radius: 3px;">X</button>
  `;

  const contenido = document.createElement('div');
  contenido.style.cssText = `
    padding: 20px;
    overflow-y: auto;
    background: #ffffff;
    color: #111;
    font-size: 14px;
    line-height: 1.6;
    max-height: 60vh;
  `;
  
  contenido.innerHTML = `
    <h3 style="color: #0054e3; margin-top: 0;">Estructura Técnica de Multirealidades</h3>
    <p>Este proyecto integra múltiples herramientas para el procesamiento visual en tiempo real, otorgándole a cada sistema un método único para interpretar la información de la cámara.</p>
    
    <div style="margin-top: 15px; border-left: 3px solid #70c4ff; padding-left: 10px;">
      <h4 style="margin: 0 0 5px 0; color: #0044cc;">SISTEMA 1: Detección de ausencia de movimiento (OpenCV.js)</h4>
      <p style="margin: 0; font-size: 13px;">Este sistema utiliza OpenCV para evaluar la variación lumínica entre fotogramas consecutivos.</p>
      <p style="margin: 5px 0 0 0; font-size: 13px; color: #555;">Al registrar una ausencia prolongada de movimiento en el entorno, el código manipula los píxeles para generar una distorsión visual progresiva basada en ondas sinusoidales y desfase cromático. Cualquier actividad posterior reinicia los valores a la normalidad.</p>
    </div>

    <div style="margin-top: 15px; border-left: 3px solid #70c4ff; padding-left: 10px;">
      <h4 style="margin: 0 0 5px 0; color: #0044cc;">SISTEMA 2: Mapeo corporal y reactividad lumínica (MediaPipe Hands)</h4>
      <p style="margin: 0; font-size: 13px;">Mediante MediaPipe, se realiza un seguimiento esquelético estructural de las manos.</p>
      <p style="margin: 5px 0 0 0; font-size: 13px; color: #555;">La distancia cruzada entre el índice y el pulgar actúa como controlador para la opacidad de una malla dinámica. Esta malla reacciona a la luz en tiempo real: los <b>puntos celestes</b> se adhieren a las zonas de sombra y medios tonos del cuerpo, mientras que los <b>puntos amarillos</b> se agrupan específicamente en las áreas de mayor luminosidad detectadas.</p>
    </div>

    <div style="margin-top: 15px; border-left: 3px solid #70c4ff; padding-left: 10px;">
      <h4 style="margin: 0 0 5px 0; color: #0044cc;">SISTEMA 3: Renderizado e interacción espacial (Three.js + MediaPipe)</h4>
      <p style="margin: 0; font-size: 13px;">Se combina la lectura de coordenadas de MediaPipe con el motor gráfico Three.js.</p>
      <p style="margin: 5px 0 0 0; font-size: 13px; color: #555;">Esto permite proyectar un objeto tridimensional en el espacio de la cámara. La apertura de la mano determina la escala del objeto, mientras que el gesto de puño modifica su posición, logrando traducir coordenadas bidimensionales en una interacción espacial fluida.</p>
    </div>
  `;

  ventana.appendChild(barraTitulo);
  ventana.appendChild(contenido);
  document.body.appendChild(ventana);

  document.getElementById('cerrar-tecnologias').addEventListener('click', () => {
    ventana.remove();
  });
}

function crearVentanaCreditos() {
  if (document.getElementById('ventana-creditos')) return;

  const ventana = document.createElement('div');
  ventana.id = 'ventana-creditos';
  ventana.style.cssText = `
    position: fixed;
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
    width: 450px;
    background: #ece9d8;
    border: 2px solid #0054e3;
    box-shadow: 4px 4px 15px rgba(0,0,0,0.4);
    z-index: 10002;
    font-family: Tahoma, sans-serif;
    display: flex;
    flex-direction: column;
    border-radius: 6px 6px 0 0;
    overflow: hidden;
  `;

  const barraTitulo = document.createElement('div');
  barraTitulo.style.cssText = `
    background: linear-gradient(to right, #0054e3 0%, #a3c5ff 100%);
    color: white;
    padding: 6px 10px;
    font-weight: bold;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  barraTitulo.innerHTML = `
    <span>👥 Créditos del Proyecto</span>
    <button id="cerrar-creditos" style="background: #e81123; color: white; border: none; width: 20px; height: 20px; font-weight: bold; cursor: pointer; border-radius: 3px;">X</button>
  `;

  const contenido = document.createElement('div');
  contenido.style.cssText = `
    padding: 20px;
    background: #ffffff;
    color: #111;
    font-size: 14px;
    line-height: 1.6;
  `;
  
  contenido.innerHTML = `
    <h3 style="color: #0054e3; margin-top: 0; text-align: center;">Multirealidades.sys</h3>
    
    <p style="margin-top: 15px;">Este proyecto fue realizado por:</p>
    <ul style="margin: 5px 0 15px 20px; font-weight: bold; color: #0044cc;">
      <li>Isidora Alvarez</li>
      <li>Dayana Pañitrur</li>
    </ul>

    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ccc;">
      <p style="margin: 0; font-size: 13px; color: #555;">Nos apoyamos en el trabajo de Felipe Roa <b>"Dos Realidades"</b>, que nos ayudó a generar una base del código para este desarrollo.</p>
      <p style="margin: 10px 0 0 0; font-size: 13px; text-align: center;">
        <a href="https://github.com/fefeliperoar/dos-realidades" target="_blank" style="color: #0054e3; text-decoration: none; font-weight: bold; border: 1px solid #0054e3; padding: 4px 8px; border-radius: 4px; display: inline-block;">🔗 Ver repositorio base en GitHub</a>
      </p>
    </div>
  `;

  ventana.appendChild(barraTitulo);
  ventana.appendChild(contenido);
  document.body.appendChild(ventana);

  document.getElementById('cerrar-creditos').addEventListener('click', () => {
    ventana.remove();
  });
}

function configurarTooltipsGestos() {
  const imgSistema2 = new Image();
  imgSistema2.src = 'sistema2.png';
  
  const imgSistema3 = new Image();
  imgSistema3.src = 'sistema3.png';
  // Previene el bucle infinito si la imagen de respaldo tampoco existe
  imgSistema3.onerror = function() { 
    this.onerror = null; 
    this.src = 'gesto-sistema3.png'; 
  };

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-gesto';
  // Asegura que el ratón ignore la caja y no cause parpadeos
  tooltip.style.pointerEvents = 'none'; 
  document.body.appendChild(tooltip);

  function activarHover(elementoId, imagenObj) {
    const el = document.getElementById(elementoId);
    if (!el) return;
    el.addEventListener('mouseenter', () => {
      tooltip.innerHTML = '';
      tooltip.appendChild(imagenObj);
      tooltip.style.display = 'block';
    });
    el.addEventListener('mousemove', (e) => {
      // Se aumentó la separación del puntero para evitar solapamientos
      tooltip.style.left = (e.clientX + 20) + 'px';
      tooltip.style.top = (e.clientY + 20) + 'px';
    });
    el.addEventListener('mouseleave', () => { 
      tooltip.style.display = 'none'; 
    });
  }

  activarHover('caja-sistema2', imgSistema2);
  activarHover('caja-sistema3', imgSistema3);
}

window.addEventListener('DOMContentLoaded', () => {
  videoElement = document.getElementById('webcam');
  btnCamara = document.getElementById('btn-camara');
  textoCamara = document.getElementById('texto-camara');

  canvasOpenCV = document.getElementById('canvas-opencv');
  ctxOpenCV = canvasOpenCV.getContext('2d', { willReadFrequently: true });
  statusAlucinacion = document.getElementById('status-alucinacion');

  canvasMediaPipe = document.getElementById('canvas-mediapipe');
  ctxMediaPipe = canvasMediaPipe.getContext('2d', { willReadFrequently: true });

  canvasOpenCV.width = ANCHO; canvasOpenCV.height = ALTO;
  canvasMediaPipe.width = ANCHO; canvasMediaPipe.height = ALTO;

  if (btnCamara) btnCamara.addEventListener('click', toggleCamara);

  const btnReflexionMenu = document.getElementById('menu-reflexion');
  if (btnReflexionMenu) {
    btnReflexionMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      crearVentanaReflexion();
    });
  }

  const btnTecnologiasMenu = document.getElementById('menu-tecnologias');
  if (btnTecnologiasMenu) {
    btnTecnologiasMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      crearVentanaTecnologias();
    });
  }

  const btnCreditosMenu = document.getElementById('menu-creditos');
  if (btnCreditosMenu) {
    btnCreditosMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      crearVentanaCreditos();
    });
  }

  configurarTooltipsGestos();
  iniciarThreeJS();
  configurarMediaPipeHands();

  imagenInactiva.onload = () => {
    procesarOpenCV();
    procesarBarreraCuerpo();
  };

  function bucleGeneral() {
    procesarOpenCV();
    procesarBarreraCuerpo();
    actualizarThreeJS();
    requestAnimationFrame(bucleGeneral);
  }
  bucleGeneral();
});