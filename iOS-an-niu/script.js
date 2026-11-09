"use strict";

/* ============================================ */
/* 液态分段控件：弹簧跟手拖动 + 宽度形变 + 弹性回弹 */
/* 位移、宽度、高度全部由弹簧逐帧驱动，不依赖 CSS 过渡 */
/* ============================================ */
const capsule = document.getElementById("capsule");
const result = document.getElementById("result");
const LABELS = { light: "1", balanced: "2", strong: "3", extra: "4" };

/* ---------- 手感参数 ---------- */
// const PRESS_SCALE = 0.95; /* 按下时指示器高度收缩到的比例，只缩放不形变 */
const PRESS_SCALE = 1.05;
const DRAG_START = 2;     /* 指针横向移动超过 2px 才算拖动 */
const RUBBER = 0.4;       /* 越界后的位移阻尼，越小越拉不动 */
const MAX_STRETCH = 0.1;  /* 越界时宽度最多拉长到 1.1 倍 */
const TRACK_FOLLOW = 0.03; /* 拖动时轨道跟随位移的比例，越小越不明显 */
const TRACK_MAX = 10;      /* 轨道跟随位移上限（px），避免整条胶囊跑太远 */
const MOTION_SPEED = 320;  /* 拉动速度达到多少（px/秒）算满速拉伸 */
const MOTION_STRETCH = 0.2; /* 满速时横向最多拉长 20% */
const MOTION_SQUASH = 0.035; /* 满速时纵向最多压扁 3.5%，保持体积感 */
const SLIDE_HIDE_SPEED = 30; /* 指示器移动超过这个速度（px/秒）就隐去文字底下的深色底 */

// k是加速，d是减速
/* 弹簧参数：拖动跟手用硬阻尼（跟得紧），松手回弹用软阻尼（带一点弹性） */
const FOLLOW = { k: 2400, d: 150 };
const SNAP = { k: 780, d: 45 };

/* 单独点击切换用的弹簧：比松手回弹更软一些，指示器滑过去的速度慢一点点 */
const SWITCH = { k: 560, d: 40 };
const STRETCH = { k: 2000, d: 140 };

/* 拉动快慢对应两套手感：快拉更硬更弹，慢拉更软更黏 */
const MOTION_FAST = { k: 560, d: 20 };
const MOTION_SLOW = { k: 220, d: 13 };
const MOTION_FAST_SPEED = 260; /* 超过这个速度（px/秒）按快拉处理 */

/* ---------- 弹簧单元 ---------- */
/* 半隐式欧拉积分：位移、速度逐帧推进，天然平滑且不会冲过目标太多 */
function spring(k, d, value) {
  let current = value;
  let velocity = 0;
  let stiffness = k;
  let damping = d;

  return {
    /* 立即定位，不产生过渡 */
    reset(v) {
      current = v;
      velocity = 0;
    },
    /* 动态换手感：拖动与回弹使用不同刚度 */
    tune(nextK, nextD) {
      stiffness = nextK;
      damping = nextD;
    },
    /* 推进 dt 秒，返回新的当前值 */
    step(target, dt) {
      velocity += ((target - current) * stiffness - velocity * damping) * dt;
      current += velocity * dt;
      return current;
    },
    /* 位移或速度还没归零，就还需要继续下一帧 */
    moving(target) {
      return Math.abs(target - current) > 0.01 || Math.abs(velocity) > 0.1;
    },
    get value() {
      return current;
    },
  };
}

const posSpring = spring(FOLLOW.k, FOLLOW.d, 0);       /* 横向位移 */
const stretchSpring = spring(STRETCH.k, STRETCH.d, 1); /* 宽度形变 */
const pressSpring = spring(SNAP.k, SNAP.d, 1);         /* 高度缩放 */
const motionSpring = spring(MOTION_SLOW.k, MOTION_SLOW.d, 0); /* 移动时的液态形变强度 */

/* ---------- 运行状态 ---------- */
let dragging = false; /* 是否按住指示器 */
let freeMove = false; /* 是否已超过阈值进入跟手拖动 */
let startX = 0;       /* 按下时的指针横坐标 */
let startPos = 0;     /* 按下时的起点位移 */
let slots = [];       /* 每个分段的横向位移 */
let itemSize = 0;     /* 单个分段宽度 */
let pad = 3;          /* 胶囊内边距 */
let currentPos = 0;   /* 已渲染的位移，用于判断指示器范围 */

let targetPos = 0;     /* 弹簧目标位移 */
let targetStretch = 1; /* 弹簧目标宽度倍数 */
let targetPress = 1;   /* 弹簧目标高度倍数 */
let motionTarget = 0;  /* 本帧移动量换算出的形变目标，0 到 1 */
let motionFast = false; /* 当前是否在用“快拉”那套弹簧手感 */

let rafId = 0;   /* 动画帧句柄 */
let lastTime = 0; /* 上一帧时间戳 */
let previewIndex = -1; /* 上次预览的分段下标，避免每帧重复写 DOM */

/* ---------- 布局测量 ---------- */
/* 取出全部分段按钮 */
function getItems() {
  return Array.from(capsule.querySelectorAll(".capsule-item"));
}

/* 读取内边距、每段位移、单段宽度 */
function measure() {
  const style = getComputedStyle(capsule);
  pad = parseFloat(style.paddingLeft) || 3;

  const items = getItems();
  slots = items.map((item) => item.offsetLeft - pad);

  if (items[0]) itemSize = items[0].offsetWidth;

  /* 尺寸变化时同步重画折射位移图 */
  updateLensMap();
}

/* ---------- 折射位移图 ---------- */
/* 位移图按指示器真实尺寸生成：沿胶囊轮廓法线的向量场 */
/* 只要尺寸没变就不重画，避免每次按下都重复生成 */
const lensMap = document.getElementById("lens-map");
const LENS_REGION = 1.3; /* 滤镜区域是元素的 130%，与 filter 的 width/height 对应 */
const LENS_BAND = 8;     /* 只在轮廓内侧 8px 这一圈折射 */
const LENS_PULL = 4;     /* 轮廓处背景最多被拉进来 4px */
const LENS_SCALE = 18;   /* 按住时折射的最大强度，必须与 feDisplacementMap 的 scale 上限一致 */
let lensKey = "";        /* 上次生成时的尺寸，用来跳过重复生成 */
const lensWarp = document.getElementById("lens-warp"); /* 控制折射强弱的滤镜节点 */
let lensStrength = 0;    /* 当前已写入的折射强度 */

/* 折射只在按住/拖动时工作：按压力度 0 → 强度 0，完全松开后自动归零 */
function setLensStrength(next) {
  /* 变化太小就不重写属性，避免每帧都触发滤镜重建 */
  if (!lensWarp || Math.abs(next - lensStrength) < 0.3) return;
  lensStrength = next;
  lensWarp.setAttribute("scale", next.toFixed(1));
}

function updateLensMap() {
  if (!lensMap || !itemSize) return;

  const h = Math.max(1, capsule.clientHeight - pad * 2); /* 指示器高度 */
  const cw = Math.round(itemSize * LENS_REGION);         /* 滤镜区域宽 */
  const ch = Math.round(h * LENS_REGION);                /* 滤镜区域高 */

  const key = cw + "x" + ch;
  if (key === lensKey) return;
  lensKey = key;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(cw, ch);
  const data = image.data;

  const hw = itemSize / 2; /* 半宽 */
  const hh = h / 2;        /* 半高，也是两端半圆的半径 */

  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = (y * cw + x) * 4;
      /* 像素中心相对胶囊中心的坐标 */
      const px = x + 0.5 - cw / 2;
      const py = y + 0.5 - ch / 2;
      const qx = Math.abs(px) - (hw - hh);
      const qy = Math.abs(py);

      /* 圆角矩形有向距离场：负数表示在胶囊内部 */
      const mx = Math.max(qx, 0);
      const my = Math.max(qy, 0);
      const sd = Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - hh;

      /* 默认中灰：胶囊外和轮廓带以外的区域都不位移 */
      let nr = 0.5;
      let ng = 0.5;
      const depth = -sd; /* 距轮廓的深度，轮廓上为 0 */
      if (depth >= 0 && depth < LENS_BAND) {
        /* 轮廓外法线：两端半圆取径向，上下直边取竖直方向 */
        let nx = 0;
        let ny = 0;
        if (qx > 0 && qy > 0) {
          const len = Math.sqrt(qx * qx + qy * qy) || 1;
          nx = Math.sign(px) * (qx / len);
          ny = Math.sign(py) * (qy / len);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }

        /* 越贴近轮廓拉力越强；沿法线反方向取样，不会采到胶囊外的背景 */
        const pull = (LENS_PULL * (1 - depth / LENS_BAND)) / LENS_SCALE;
        nr = 0.5 - nx * pull;
        ng = 0.5 - ny * pull;
      }

      data[i] = Math.round(nr * 255);
      data[i + 1] = Math.round(ng * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  /* 生成的 PNG 直接作为 feImage 的位移图 */
  lensMap.setAttribute("href", canvas.toDataURL("image/png"));
}

/* ---------- 渲染 ---------- */
/* 把弹簧当前值写成 CSS 变量，由 .capsule::before 绘制 */
function render() {
  const pos = posSpring.value;
  const stretch = stretchSpring.value;
  const press = pressSpring.value;

  /* 形变强度由弹簧给出：比位移慢半拍，按住不动时也会自己压回去再弹回来 */
  const motion = motionSpring.value;

  currentPos = pos;

  /* 拖动时整条轨道轻微跟随指示器移动 */
  /* 用 tanh 做软饱和：起点附近跟得动，越接近上限越慢，不会硬停在边界上 */
  const raw = (pos - startPos) * TRACK_FOLLOW;
  const shift = dragging ? TRACK_MAX * Math.tanh(raw / TRACK_MAX) : 0;
  capsule.style.setProperty("--capsule-shift", shift.toFixed(2) + "px");

  /* 移动时横向拉长、纵向轻微压扁，做出液态被拖走的感觉；停稳后比例回到 1 */
  const motionWide = 1 + MOTION_STRETCH * motion;
  const motionFlat = 1 - MOTION_SQUASH * motion;

  capsule.style.setProperty(
    "--indicator-transform",
    "translate3d(" +
      pos.toFixed(2) +
      "px, 0, 0) scale(" +
      (stretch * press * motionWide).toFixed(4) +
      ", " +
      (press * motionFlat).toFixed(4) +
      ")"
  );

  /* 折射跟着按压走：静止为 0，按住越深越强，松手回弹时同步减弱到 0 */
  /* 折射进度归一化：取绝对量，PRESS_SCALE 是放大还是收缩都能算出 0 到 1 */
  const lensProgress = Math.min(1, Math.abs(press - 1) / (Math.abs(PRESS_SCALE - 1) || 1));
  setLensStrength(lensProgress * LENS_SCALE);
}

/* ---------- 弹簧主循环 ---------- */
function tick(now) {
  /* 限制最大时间步，页面切回来时不会一次跳很远 */
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
  lastTime = now;

  /* 大时间步拆成小步积分，快速拖动时弹簧也不会数值抖动 */
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;

  /* 记下本帧位移起点，用来换算液态形变的强度 */
  const frameStartPos = posSpring.value;

  for (let i = 0; i < steps; i += 1) {
    posSpring.step(targetPos, h);
    stretchSpring.step(targetStretch, h);
    pressSpring.step(targetPress, h);
  }

  /* 有位移就有形变，停下就归零；形变本身也是弹簧，所以归零的过程会先抢过再弹回
     只在按住拖动时生效：单独点击切换不做形变，避免和按下态叠加得太花 */
  const speed = dragging ? Math.abs(posSpring.value - frameStartPos) / dt : 0;
  motionTarget = Math.min(1, speed / MOTION_SPEED);

  /* 指示器本帧的实际移动速度：拖动、点击切换、松手回弹都算在内
     超过阈值就给胶囊打标记，让文字底下的深色底快速隐去 */
  const slideSpeed = Math.abs(posSpring.value - frameStartPos) / dt;
  capsule.classList.toggle("is-moving", slideSpeed > SLIDE_HIDE_SPEED);

  /* 按实时速度换手感：快拉用硬弹簧（跟得紧、弹一下就走），慢拉用软弹簧（更黏更拖沓） */
  const fast = speed > MOTION_FAST_SPEED;
  if (fast !== motionFast) {
    motionFast = fast;
    const feel = fast ? MOTION_FAST : MOTION_SLOW;
    motionSpring.tune(feel.k, feel.d);
  }

  motionSpring.step(motionTarget, dt);

  render();

  /* 拖动中用渲染后的位置预览最近分段，高亮和指示器永远同步 */
  /* 只有跨到新分段时才改 DOM，避免每帧重复设置文字和类名 */
  if (dragging) {
    const index = nearestIndex(currentPos);
    if (index !== previewIndex) {
      previewIndex = index;
      const item = getItems()[index];
      if (item) {
        setPressed(item);
        selectSegment(item.dataset.segment);
      }
    }
  }

  const moving =
    posSpring.moving(targetPos) ||
    stretchSpring.moving(targetStretch) ||
    pressSpring.moving(targetPress) ||
    motionSpring.moving(motionTarget);

  /* 弹簧还在动就继续下一帧；拖动中指针停下后循环会自动休眠 */
  if (moving) {
    rafId = requestAnimationFrame(tick);
    return;
  }

  /* 落定时精确对齐目标，避免残留亚像素误差 */
  /* 点击切换到位：松开按下状态，让指示器在终点回弹恢复原形
     拖动中按着不动时不能松，否则按住的手感会丢失 */
  if (!dragging && targetPress !== 1) {
    targetPress = 1;
    setPressed(null);
    /* 重新起一轮动画，把按压态回弹到原形 */
    rafId = requestAnimationFrame(tick);
    lastTime = 0;
    return;
  }

  posSpring.reset(targetPos);
  stretchSpring.reset(targetStretch);
  pressSpring.reset(targetPress);
  /* 形变回弹彻底结束，指示器恢复标准胶囊 */
  motionSpring.reset(0);
  motionTarget = 0;
  render();
  rafId = 0;
  lastTime = 0;
}

/* 需要动画时启动循环，已在运行则忽略 */
function startLoop() {
  if (rafId) return;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

/* 无动画直接定位到某个分段，用于初始化和窗口尺寸变化 */
function snapTo(pos) {
  targetPos = pos;
  targetStretch = 1;
  targetPress = 1;
  posSpring.reset(pos);
  stretchSpring.reset(1);
  pressSpring.reset(1);
  motionSpring.reset(0);
  motionTarget = 0;
  /* 硬定位时指示器不再移动，清掉移动标记让文字底色恢复 */
  capsule.classList.remove("is-moving");
  render();
}

/* ---------- 选中与按压 ---------- */
/* 切换选中分段，只影响文字高亮和结果文案 */
function selectSegment(segment) {
  if (!LABELS[segment]) return;
  getItems().forEach((item) => {
    const active = item.dataset.segment === segment;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  if (result) result.textContent = `当前档位：${LABELS[segment]}`;
}

/* 按住时只给对应分段提升层级 */
function setPressed(item) {
  getItems().forEach((card) => card.classList.toggle("pressing", card === item));
}

/* 根据横向位移找最近的分段下标 */
function nearestIndex(pos) {
  let best = 0;
  slots.forEach((slot, i) => {
    if (Math.abs(slot - pos) < Math.abs(slots[best] - pos)) best = i;
  });
  return best;
}

/* 按下点是否落在白色指示器范围内，只有按在指示器上才允许拖动 */
function isOnIndicator(event) {
  const rect = capsule.getBoundingClientRect();
  const left = rect.left + pad + currentPos;
  return event.clientX >= left && event.clientX <= left + itemSize;
}

/* ---------- 指针换算 ---------- */
/* 指针位置 → 目标位移与目标宽度：越界部分按阻尼外移，同时按越界距离拉宽 */
function updateTarget(clientX) {
  const min = slots[0] ?? 0;
  const max = slots[slots.length - 1] ?? 0;
  let pos = startPos + (clientX - startX);
  let overshoot = 0;

  if (pos < min) {
    overshoot = min - pos;
    pos = min - overshoot * RUBBER;
  } else if (pos > max) {
    overshoot = pos - max;
    pos = max + overshoot * RUBBER;
  }

  targetPos = pos;
  targetStretch = 1 + Math.min(overshoot / itemSize, MAX_STRETCH);
}

/* ---------- 键盘 / 点击（detail 为 0）：弹簧切到目标分段 ---------- */
capsule.addEventListener("click", (event) => {
  if (event.detail !== 0) return;
  const item = event.target.closest("[data-segment]");
  if (!item) return;

  measure();
  const index = getItems().indexOf(item);

  posSpring.tune(SWITCH.k, SWITCH.d);
  targetPos = slots[index] ?? 0;
  targetStretch = 1;
  /* 点击切换时指示器保持按下状态跑到目标位置，落定后再回弹恢复 */
  targetPress = PRESS_SCALE;
  setPressed(item);
  selectSegment(item.dataset.segment);
  startLoop();
});

/* ---------- 按下 ---------- */
capsule.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const item = event.target.closest("[data-segment]");
  if (!item) return;

  measure();
  const index = getItems().indexOf(item);
  const slot = slots[index] ?? 0;

  /* 按在滑轨上（不在指示器里）：只做弹性切换，禁止拖动 */
  if (!isOnIndicator(event)) {
    posSpring.tune(SWITCH.k, SWITCH.d);
    targetPos = slot;
    targetStretch = 1;
    /* 单点切换：指示器带着按下态滑到目标位置，落定后再回弹恢复原形 */
    targetPress = PRESS_SCALE;
    setPressed(item);
    selectSegment(item.dataset.segment);
    startLoop();
    return;
  }

  /* 按在指示器上：进入跟手拖动，高度轻微收缩 */
  dragging = true;
  freeMove = false;
  startX = event.clientX;
  startPos = slot;
  /* 按住期间锁定手掌光标，拖出胶囊也不会变形状 */
  document.body.classList.add("cursor-hand");
  /* 捕获指针：个别环境（无有效 pointerId）会抛错，失败时不影响后续拖动逻辑 */
  try {
    capsule.setPointerCapture(event.pointerId);
  } catch (error) {
    /* 忽略：没有捕获时仍可用胶囊本身的 pointermove 事件 */
  }
  /* 拖动期间关闭轨道过渡，跟随位移才能实时生效 */
  capsule.classList.add("dragging");

  posSpring.tune(FOLLOW.k, FOLLOW.d);
  targetPos = slot;
  targetStretch = 1;
  targetPress = PRESS_SCALE;
  previewIndex = index;
  setPressed(item);
  selectSegment(item.dataset.segment);
  startLoop();
  event.preventDefault();
});

/* ---------- 拖动：先过阈值，再逐帧跟手 ---------- */
capsule.addEventListener("pointermove", (event) => {
  if (!dragging) return;

  /* 未超过阈值前仍按点击处理，保住按下时的缩放过渡 */
  if (!freeMove) {
    if (Math.abs(event.clientX - startX) < DRAG_START) return;
    freeMove = true;
  }

  updateTarget(event.clientX);
  /* 指针停下时循环会休眠，移动时重新唤醒 */
  startLoop();
});

/* ---------- 松手：宽度回正，位移弹回最近分段 ---------- */
function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  freeMove = false;
  if (capsule.hasPointerCapture(event.pointerId)) {
    capsule.releasePointerCapture(event.pointerId);
  }
  /* 恢复过渡，轨道跟随位移会在下一帧回到 0 */
  capsule.classList.remove("dragging");
  previewIndex = -1;
  setPressed(null);

  const index = nearestIndex(currentPos);
  posSpring.tune(SNAP.k, SNAP.d);
  targetPos = slots[index] ?? 0;
  targetStretch = 1;
  targetPress = 1;
  selectSegment(getItems()[index]?.dataset.segment);
  startLoop();
}

capsule.addEventListener("pointerup", endDrag);
capsule.addEventListener("pointercancel", endDrag);

/* ---------- 手掌光标恢复 ---------- */
/* 松手、手势取消、窗口失焦都要解除锁定，防止光标一直停在手掌 */
function resetCursor() {
  document.body.classList.remove("cursor-hand");
}

window.addEventListener("pointerup", resetCursor);
window.addEventListener("pointercancel", resetCursor);
window.addEventListener("blur", resetCursor);
/* 兜底：指针在胶囊外松开（没捕获成功时）也要结束拖动，避免卡在按住状态 */
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

/* ---------- 初始化 ---------- */
measure();
const initial = getItems().findIndex((item) => item.classList.contains("active"));
snapTo(slots[initial < 0 ? 0 : initial] ?? 0);

/* 窗口尺寸变化：重新量布局，对齐当前选中项 */
window.addEventListener("resize", () => {
  if (dragging) return;
  measure();
  const active = getItems().findIndex((item) => item.classList.contains("active"));
  snapTo(slots[active < 0 ? 0 : active] ?? 0);
});
