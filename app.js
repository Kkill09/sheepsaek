/**
 * SpineGuard AI - 척추 및 경추 교정 AI 솔루션 메인 애플리케이션 (app.js)
 * ----------------------------------------------------------------------
 * - 듀얼 입력 모드 (수동 시뮬레이터 & 스마트폰 자이로 센서)
 * - model.js 연동 실시간 AI 앙상블 추론 (1ms 미만 지연율)
 * - Web Audio API 실시간 청각 경고 시스템
 * - 인터랙티브 SVG 인체 경추 아바타 및 체압 매트릭스 동적 시각화
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. 상태 관리 객체 (State)
  // =========================================================================
  const state = {
    mode: 'manual',            // 'manual' | 'sensor'
    pitch: 5.0,                // 고개 전방 숙임 각도 (0 ~ 60°)
    roll: 0.0,                 // 고개 좌우 측면 기울기 (-45 ~ 45°)
    leftPressure: 50,          // 좌측 체압 비율 (%)
    rightPressure: 50,         // 우측 체압 비율 (%)
    pressureImbalance: 0.0,    // |L - R| / (L + R) (0.0 ~ 1.0)
    cervicalLoadKg: 5.0,       // Hansraj 추정 경추 하중
    soundEnabled: true,        // 사운드 알림 활성화 여부
    sensorActive: false,       // DeviceOrientation 센서 활성 여부
    calibratedBeta: 0.0,       // 자이로 Pitch 영점 기준
    calibratedGamma: 0.0,      // 자이로 Roll 영점 기준
    lastPostureClass: -1,      // 직전 판별 자세 클래스 (사운드 재생용)
    lastAudioTime: 0           // 오디오 디바운스 타임스탬프
  };

  // =========================================================================
  // 2. DOM 요소 캐싱
  // =========================================================================
  const DOM = {
    // 헤더 & 모드
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIconOn: document.getElementById('soundIconOn'),
    soundIconOff: document.getElementById('soundIconOff'),
    soundText: document.getElementById('soundText'),
    modeManualBtn: document.getElementById('modeManualBtn'),
    modeSensorBtn: document.getElementById('modeSensorBtn'),
    sensorIndicator: document.getElementById('sensorIndicator'),

    // 배너
    statusBanner: document.getElementById('statusBanner'),
    statusEmoji: document.getElementById('statusEmoji'),
    postureBadge: document.getElementById('postureBadge'),
    postureTitle: document.getElementById('postureTitle'),
    postureDesc: document.getElementById('postureDesc'),
    quickLoad: document.getElementById('quickLoad'),
    quickImbalance: document.getElementById('quickImbalance'),
    quickConfidence: document.getElementById('quickConfidence'),

    // 컨트롤 & 슬라이더
    sensorConnectBox: document.getElementById('sensorConnectBox'),
    startSensorBtn: document.getElementById('startSensorBtn'),
    calibrateBtn: document.getElementById('calibrateBtn'),
    sensorStatusMsg: document.getElementById('sensorStatusMsg'),

    pitchSlider: document.getElementById('pitchSlider'),
    pitchNumber: document.getElementById('pitchNumber'),
    rollSlider: document.getElementById('rollSlider'),
    rollNumber: document.getElementById('rollNumber'),
    pressureSlider: document.getElementById('pressureSlider'),
    leftPercentText: document.getElementById('leftPercentText'),
    rightPercentText: document.getElementById('rightPercentText'),

    // 프리셋 버튼
    presets: {
      normal: document.getElementById('presetNormal'),
      forward: document.getElementById('presetForward'),
      imbalance: document.getElementById('presetImbalance'),
      severe: document.getElementById('presetSevere')
    },

    // 지표 & 시각화
    loadNumberBig: document.getElementById('loadNumberBig'),
    cervicalHeadline: document.getElementById('cervicalHeadline'),
    cervicalLevelPill: document.getElementById('cervicalLevelPill'),
    cervicalGaugeFill: document.getElementById('cervicalGaugeFill'),
    gaugeMarker: document.getElementById('gaugeMarker'),
    markerLabel: document.getElementById('markerLabel'),

    // SVG 아바타 & 체압
    headNeckGroup: document.getElementById('headNeckGroup'),
    avatarCaption: document.getElementById('avatarCaption'),
    headCircle: document.getElementById('headCircle'),
    spineCurve: document.getElementById('spineCurve'),

    balanceLeftFill: document.getElementById('balanceLeftFill'),
    balanceRightFill: document.getElementById('balanceRightFill'),
    balanceStatusText: document.getElementById('balanceStatusText'),
    sensorCells: [
      document.getElementById('sensorS1'),
      document.getElementById('sensorS2'),
      document.getElementById('sensorS3'),
      document.getElementById('sensorS4'),
      document.getElementById('sensorS5'),
      document.getElementById('sensorS6')
    ],

    // 예측 확률 바
    probBars: [
      document.getElementById('probBar0'),
      document.getElementById('probBar1'),
      document.getElementById('probBar2'),
      document.getElementById('probBar3')
    ],
    probVals: [
      document.getElementById('probVal0'),
      document.getElementById('probVal1'),
      document.getElementById('probVal2'),
      document.getElementById('probVal3')
    ],

    // 하단 스트레칭 처방
    stretchingCard: document.getElementById('stretchingCard'),
    stretchTitle: document.getElementById('stretchTitle'),
    stretchSteps: document.getElementById('stretchSteps')
  };

  // =========================================================================
  // 3. Web Audio API 청각 경고음 시스템
  // =========================================================================
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlertSound(type) {
    if (!state.soundEnabled) return;
    initAudioContext();
    if (!audioCtx) return;

    const now = Date.now();
    // 과도한 연속 비프음 방지 (1.2초 디바운스)
    if (now - state.lastAudioTime < 1200) return;
    state.lastAudioTime = now;

    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'severe') {
        // 복합 고위험: 긴박한 이중 비프 경고음 (880Hz -> 660Hz)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(660, t + 0.15);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      } else if (type === 'warning' || type === 'imbalance') {
        // 거북목 또는 불균형: 부드러운 주의 알림음 (523Hz C5 -> 659Hz E5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.2);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      } else if (type === 'safe') {
        // 정상 복귀: 기분 좋은 은은한 딩동음
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      }
    } catch (e) {
      console.warn('Audio playback not permitted or failed:', e);
    }
  }

  // =========================================================================
  // 4. AI 추론 및 파라미터 계산 엔진
  // =========================================================================
  function runInference() {
    // 1. 방석 체압 편중 지수 계산: |L - R| / (L + R)
    const pL = state.leftPressure;
    const pR = state.rightPressure;
    const imbalance = Math.abs(pL - pR) / (pL + pR);
    state.pressureImbalance = imbalance;

    // 2. Hansraj 생체역학 기준 경추 하중 계산
    const pitch = Math.max(0, Math.min(60, state.pitch));
    const roll = state.roll;
    const cervicalLoad = window.PostureAI ? 
      window.PostureAI.calculateCervicalLoad(pitch) : 
      5.0 + (pitch / 60.0) * 22.0;
    state.cervicalLoadKg = cervicalLoad;

    // 3. 머신러닝 모델 예측 실행
    let result;
    if (window.PostureAI && typeof window.PostureAI.predictPosture === 'function') {
      result = window.PostureAI.predictPosture(pitch, Math.abs(roll), imbalance, cervicalLoad);
    } else {
      // 대체 룰베이스 폴백
      result = fallbackPredict(pitch, Math.abs(roll), imbalance, cervicalLoad);
    }

    // 4. 상태 변화 감지 및 경고음 재생
    if (result.classId !== state.lastPostureClass) {
      playAlertSound(result.riskLevel);
      state.lastPostureClass = result.classId;
    }

    // 5. 대시보드 UI 실시간 업데이트
    updateUI(result);
  }

  function fallbackPredict(pitch, roll, imbalance, load) {
    const isForward = pitch >= 15.0;
    const isImbalanced = imbalance >= 0.3 || roll >= 15.0;
    let classId = 0;
    if (isForward && !isImbalanced) classId = 1;
    else if (!isForward && isImbalanced) classId = 2;
    else if (isForward && isImbalanced) classId = 3;

    return {
      classId: classId,
      neckPitch: pitch,
      neckRoll: roll,
      pressureImbalance: imbalance,
      cervicalLoadKg: load,
      confidence: 99,
      probabilities: [classId===0?99:0, classId===1?99:0, classId===2?99:0, classId===3?99:0]
    };
  }

  // =========================================================================
  // 5. UI 동적 렌더링 함수
  // =========================================================================
  function updateUI(result) {
    const { classId, riskLevel, confidence, probabilities } = result;

    // 1. 상단 배너 테마 업데이트
    DOM.statusBanner.className = `status-banner ${riskLevel}`;
    DOM.postureBadge.className = `status-badge badge-${riskLevel}`;
    DOM.postureBadge.textContent = result.statusText;
    DOM.postureTitle.textContent = result.className;
    DOM.postureDesc.textContent = result.message;

    const emojiMap = { safe: '🟢', warning: '🟡', imbalance: '🟠', severe: '🔴' };
    DOM.statusEmoji.textContent = emojiMap[riskLevel] || '🟢';

    DOM.quickLoad.innerHTML = `${state.cervicalLoadKg.toFixed(1)} <small>kg</small>`;
    const imbStatusStr = state.pressureImbalance >= 0.3 ? '(불균형 위험)' : '(안정)';
    DOM.quickImbalance.innerHTML = `${state.pressureImbalance.toFixed(2)} <small>${imbStatusStr}</small>`;
    DOM.quickConfidence.innerHTML = `${confidence} <small>%</small>`;

    // 2. 경추 하중 게이지 업데이트 (0kg ~ 27kg 기준 0~100%)
    const loadVal = state.cervicalLoadKg;
    DOM.loadNumberBig.textContent = loadVal.toFixed(1);

    // 하중에 따른 텍스트 컬러 지정
    if (loadVal < 12) {
      DOM.loadNumberBig.style.color = 'var(--color-safe)';
      DOM.cervicalLevelPill.textContent = '정상 (0~15°)';
      DOM.cervicalLevelPill.className = 'cervical-level-pill badge-safe';
    } else if (loadVal < 18) {
      DOM.loadNumberBig.style.color = 'var(--color-warning)';
      DOM.cervicalLevelPill.textContent = '주의 (15~30°)';
      DOM.cervicalLevelPill.className = 'cervical-level-pill badge-warning';
    } else if (loadVal < 22) {
      DOM.loadNumberBig.style.color = '#f97316';
      DOM.cervicalLevelPill.textContent = '경고 (30~45°)';
      DOM.cervicalLevelPill.className = 'cervical-level-pill badge-imbalance';
    } else {
      DOM.loadNumberBig.style.color = 'var(--color-severe)';
      DOM.cervicalLevelPill.textContent = '고위험 (45~60°)';
      DOM.cervicalLevelPill.className = 'cervical-level-pill badge-severe';
    }

    const pctOfMax = Math.min(100, Math.max(0, (state.pitch / 60.0) * 100));
    DOM.cervicalGaugeFill.style.width = `${pctOfMax}%`;
    DOM.gaugeMarker.style.left = `${pctOfMax}%`;
    DOM.markerLabel.textContent = `${loadVal.toFixed(1)}kg (${state.pitch.toFixed(0)}°)`;

    // 3. 인체 아바타 SVG 실시간 틸트 애니메이션
    const avatarPitch = state.pitch;
    const avatarRoll = state.roll;
    // 전방 각도 회전 (x=80, y=110 축 회전)
    DOM.headNeckGroup.setAttribute('transform', `rotate(${avatarPitch}, 80, 110)`);
    DOM.avatarCaption.textContent = `전방각: ${avatarPitch.toFixed(1)}° | 측면각: ${avatarRoll > 0 ? '+' : ''}${avatarRoll.toFixed(1)}°`;

    // 상태에 따른 아바타 컬러링
    if (riskLevel === 'severe') {
      DOM.headCircle.setAttribute('fill', '#ef4444');
      DOM.spineCurve.setAttribute('stroke', '#ef4444');
    } else if (riskLevel === 'warning') {
      DOM.headCircle.setAttribute('fill', '#f59e0b');
      DOM.spineCurve.setAttribute('stroke', '#f59e0b');
    } else if (riskLevel === 'imbalance') {
      DOM.headCircle.setAttribute('fill', '#818cf8');
      DOM.spineCurve.setAttribute('stroke', '#818cf8');
    } else {
      DOM.headCircle.setAttribute('fill', '#0ea5e9');
      DOM.spineCurve.setAttribute('stroke', '#94a3b8');
    }

    // 4. 착석 방석 체압 시각화 업데이트
    const lPct = state.leftPressure;
    const rPct = state.rightPressure;
    DOM.balanceLeftFill.style.width = `${lPct}%`;
    DOM.balanceLeftFill.textContent = `${lPct}%`;
    DOM.balanceRightFill.style.width = `${rPct}%`;
    DOM.balanceRightFill.textContent = `${rPct}%`;

    const imb = state.pressureImbalance;
    if (imb >= 0.3) {
      const side = lPct > rPct ? '좌측 편중' : '우측 편중';
      DOM.balanceStatusText.innerHTML = `<span style="color:var(--color-severe); font-weight:700;">골반 ${side} 위험</span> (편중 지수: ${imb.toFixed(2)})`;
    } else if (imb >= 0.15) {
      DOM.balanceStatusText.innerHTML = `<span style="color:var(--color-warning); font-weight:600;">경미한 편중</span> (편중 지수: ${imb.toFixed(2)})`;
    } else {
      DOM.balanceStatusText.innerHTML = `<span style="color:var(--color-safe); font-weight:600;">골반 좌우 균등</span> (편중 지수: ${imb.toFixed(2)})`;
    }

    // 6개 방석 센서 셀 시각화 (S1, S3, S5: 좌측 / S2, S4, S6: 우측)
    const leftCells = [DOM.sensorCells[0], DOM.sensorCells[2], DOM.sensorCells[4]];
    const rightCells = [DOM.sensorCells[1], DOM.sensorCells[3], DOM.sensorCells[5]];

    function applySensorStyle(cells, ratio) {
      cells.forEach(cell => {
        if (!cell) return;
        cell.className = 'sensor-cell';
        if (ratio >= 70) cell.classList.add('high-pressure');
        else if (ratio >= 58) cell.classList.add('mid-pressure');
        else if (ratio >= 42) cell.classList.add('balanced');
      });
    }
    applySensorStyle(leftCells, lPct);
    applySensorStyle(rightCells, rPct);

    // 5. AI 클래스별 예측 확률 프로그레스 바
    if (probabilities && probabilities.length >= 4) {
      for (let i = 0; i < 4; i++) {
        const p = Math.max(0, Math.min(100, probabilities[i]));
        DOM.probBars[i].style.width = `${p}%`;
        DOM.probVals[i].textContent = `${p.toFixed(1)}%`;
      }
    }

    // 6. 맞춤형 30초 스트레칭 처방 카드 업데이트
    if (result.stretching) {
      DOM.stretchTitle.textContent = result.stretching.title;
      DOM.stretchSteps.innerHTML = result.stretching.steps
        .map(step => `<li>${step}</li>`)
        .join('');
      
      const themeColors = {
        safe: 'var(--color-safe)',
        warning: 'var(--color-warning)',
        imbalance: 'var(--color-imbalance)',
        severe: 'var(--color-severe)'
      };
      DOM.stretchingCard.style.borderLeftColor = themeColors[riskLevel] || 'var(--color-safe)';
    }
  }

  // =========================================================================
  // 6. 컨트롤러 이벤트 리스너 설정
  // =========================================================================
  function setupEventListeners() {
    // 1. 고개 숙임 (Pitch) 양방향 동기화
    DOM.pitchSlider.addEventListener('input', function (e) {
      state.pitch = parseFloat(e.target.value);
      DOM.pitchNumber.value = state.pitch;
      clearPresetActive();
      runInference();
    });

    DOM.pitchNumber.addEventListener('input', function (e) {
      let val = parseFloat(e.target.value) || 0;
      val = Math.max(0, Math.min(60, val));
      state.pitch = val;
      DOM.pitchSlider.value = val;
      clearPresetActive();
      runInference();
    });

    // 2. 고개 측면 기울기 (Roll) 양방향 동기화
    DOM.rollSlider.addEventListener('input', function (e) {
      state.roll = parseFloat(e.target.value);
      DOM.rollNumber.value = state.roll;
      clearPresetActive();
      runInference();
    });

    DOM.rollNumber.addEventListener('input', function (e) {
      let val = parseFloat(e.target.value) || 0;
      val = Math.max(-45, Math.min(45, val));
      state.roll = val;
      DOM.rollSlider.value = val;
      clearPresetActive();
      runInference();
    });

    // 3. 체압 밸런스 슬라이더
    DOM.pressureSlider.addEventListener('input', function (e) {
      const leftVal = parseInt(e.target.value, 10);
      const rightVal = 100 - leftVal;
      state.leftPressure = leftVal;
      state.rightPressure = rightVal;
      DOM.leftPercentText.textContent = `${leftVal}%`;
      DOM.rightPercentText.textContent = `${rightVal}%`;
      clearPresetActive();
      runInference();
    });

    // 4. 프리셋 버튼 이벤트
    function setPreset(pitch, roll, leftP, activeBtn) {
      state.pitch = pitch;
      state.roll = roll;
      state.leftPressure = leftP;
      state.rightPressure = 100 - leftP;

      DOM.pitchSlider.value = pitch;
      DOM.pitchNumber.value = pitch;
      DOM.rollSlider.value = roll;
      DOM.rollNumber.value = roll;
      DOM.pressureSlider.value = leftP;
      DOM.leftPercentText.textContent = `${leftP}%`;
      DOM.rightPercentText.textContent = `${100 - leftP}%`;

      clearPresetActive();
      if (activeBtn) activeBtn.classList.add('active');

      runInference();
    }

    DOM.presets.normal.addEventListener('click', () => {
      setPreset(5, 0, 50, DOM.presets.normal);
    });
    DOM.presets.forward.addEventListener('click', () => {
      setPreset(35, 2, 52, DOM.presets.forward);
    });
    DOM.presets.imbalance.addEventListener('click', () => {
      setPreset(10, 12, 80, DOM.presets.imbalance);
    });
    DOM.presets.severe.addEventListener('click', () => {
      setPreset(42, 20, 78, DOM.presets.severe);
    });

    function clearPresetActive() {
      Object.values(DOM.presets).forEach(btn => btn.classList.remove('active'));
    }

    // 5. 사운드 토글 버튼
    DOM.soundToggleBtn.addEventListener('click', function () {
      initAudioContext();
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) {
        DOM.soundIconOn.classList.remove('hidden');
        DOM.soundIconOff.classList.add('hidden');
        DOM.soundText.textContent = '알림음 ON';
        playAlertSound('safe');
      } else {
        DOM.soundIconOn.classList.add('hidden');
        DOM.soundIconOff.classList.remove('hidden');
        DOM.soundText.textContent = '알림음 OFF';
      }
    });

    // 6. 입력 모드 탭 전환
    DOM.modeManualBtn.addEventListener('click', function () {
      switchMode('manual');
    });

    DOM.modeSensorBtn.addEventListener('click', function () {
      switchMode('sensor');
    });

    function switchMode(newMode) {
      state.mode = newMode;
      if (newMode === 'manual') {
        DOM.modeManualBtn.classList.add('active');
        DOM.modeSensorBtn.classList.remove('active');
        DOM.sensorConnectBox.classList.add('hidden');
        DOM.sensorIndicator.textContent = '입력 모드: 수동 시뮬레이터';
        DOM.sensorIndicator.style.borderColor = 'rgba(14, 165, 233, 0.3)';
        DOM.sensorIndicator.style.color = '#38bdf8';
      } else {
        DOM.modeSensorBtn.classList.add('active');
        DOM.modeManualBtn.classList.remove('active');
        DOM.sensorConnectBox.classList.remove('hidden');
        DOM.sensorIndicator.textContent = '입력 모드: 스마트폰 자이로 센서';
        DOM.sensorIndicator.style.borderColor = 'rgba(6, 182, 212, 0.6)';
        DOM.sensorIndicator.style.color = '#22d3ee';
      }
    }

    // 7. 스마트폰 자이로 센서 (DeviceOrientation) 연결
    DOM.startSensorBtn.addEventListener('click', requestOrientationSensor);
    DOM.calibrateBtn.addEventListener('click', calibrateZeroAngle);
  }

  // =========================================================================
  // 7. 스마트폰 Web DeviceOrientation API 연동
  // =========================================================================
  function requestOrientationSensor() {
    initAudioContext();

    // iOS 13+ 권한 요청 처리
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            attachSensorListener();
          } else {
            DOM.sensorStatusMsg.textContent = '⚠️ 자이로 센서 접근 권한이 거부되었습니다.';
            DOM.sensorStatusMsg.style.color = '#ef4444';
          }
        })
        .catch(err => {
          console.error(err);
          DOM.sensorStatusMsg.textContent = '⚠️ 센서 권한 요청 오류: ' + err.message;
        });
    } else if (window.DeviceOrientationEvent) {
      // 일반 안드로이드 / 웹 브라우저
      attachSensorListener();
    } else {
      DOM.sensorStatusMsg.textContent = '⚠️ 현재 브라우저 또는 기기에서 DeviceOrientation 센서를 지원하지 않습니다. (PC 환경에서는 시뮬레이터 모드를 이용해 주세요)';
      DOM.sensorStatusMsg.style.color = '#f59e0b';
    }
  }

  let sensorAttached = false;
  function attachSensorListener() {
    if (sensorAttached) return;

    window.addEventListener('deviceorientation', handleOrientationEvent, true);
    sensorAttached = true;
    state.sensorActive = true;

    DOM.startSensorBtn.textContent = '🟢 센서 실시간 연동 중...';
    DOM.startSensorBtn.classList.remove('pulse');
    DOM.calibrateBtn.disabled = false;
    DOM.sensorStatusMsg.textContent = '실시간 모바일 각도 수신 중입니다. 고개를 움직여 보세요!';
    DOM.sensorStatusMsg.style.color = '#10b981';
  }

  function handleOrientationEvent(event) {
    if (event.beta === null && event.gamma === null) {
      DOM.sensorStatusMsg.textContent = '⚠️ 자이로 하드웨어 센서 신호가 없습니다. (PC 환경 감지됨)';
      return;
    }

    // beta: 전후 기울기 (-180° ~ 180°), 사람이 폰을 가슴/목에 쥐었을 때 숙임 반영
    // gamma: 좌우 기울기 (-90° ~ 90°)
    const rawBeta = event.beta || 0;
    const rawGamma = event.gamma || 0;

    // 영점 기준 편차 계산
    const deltaBeta = rawBeta - state.calibratedBeta;
    const deltaGamma = rawGamma - state.calibratedGamma;

    // Pitch: 0° ~ 60° 범위 클램핑 (전방 숙임)
    const currentPitch = Math.max(0, Math.min(60, Math.abs(deltaBeta)));
    // Roll: -45° ~ +45° 범위 클램핑 (좌우 기울기)
    const currentRoll = Math.max(-45, Math.min(45, deltaGamma));

    state.pitch = Math.round(currentPitch * 10) / 10;
    state.roll = Math.round(currentRoll * 10) / 10;

    // UI 인풋 동기화
    DOM.pitchSlider.value = state.pitch;
    DOM.pitchNumber.value = state.pitch;
    DOM.rollSlider.value = state.roll;
    DOM.rollNumber.value = state.roll;

    runInference();
  }

  function calibrateZeroAngle() {
    // 현재 각도를 0° 바른 자세 기준으로 설정
    window.addEventListener('deviceorientation', function onOnce(e) {
      state.calibratedBeta = e.beta || 0;
      state.calibratedGamma = e.gamma || 0;
      DOM.sensorStatusMsg.textContent = `✅ 영점 조절 완료 (현재 자세 기준: Pitch 0°, Roll 0°)`;
      window.removeEventListener('deviceorientation', onOnce, true);
    }, { once: true });
  }

  // =========================================================================
  // 8. 초기화 실행
  // =========================================================================
  function init() {
    setupEventListeners();
    // 초기 바른 자세로 1회 즉시 추론 및 렌더링
    runInference();
    console.log('SpineGuard AI Web Application Initialized Successfully.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();