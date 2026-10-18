// 게임 화면: 3D 장면(또는 간소화 학습 모드) + 겹쳐 보이는 UI.
// 3D 화면이 대부분을 차지하고, 패널은 가장자리에 둔다(가운데 시야를 가리지 않게).
//  위: HUD · 왼쪽(좁은 화면은 위): 단서 목록 · 오른쪽(좁은 화면은 아래 시트): 추론/설명 · 아래: 대화/이동 안내

import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { runtime } from '../scene/runtime';
import { useApp } from '../state/store';
import { PauseMenu } from './controls/PauseMenu';
import { SteerControls } from './controls/SteerControls';
import { TravelBar } from './controls/TravelBar';
import { useKeyboardControls } from './controls/useKeyboardControls';
import { DialogueBox } from './dialogue/DialogueBox';
import { SimplifiedStage } from './fallback/SimplifiedStage';
import { ActivityPanel, EscapeScreen, RecheckPanel } from './finale/FinalePanels';
import { HudActions, HudInfo } from './hud/Hud';
import { MapPanel } from './map/MapPanel';
import { ClueCard } from './observe/ClueCard';
import { ClueTray } from './observe/ClueTray';
import { FeedbackPanel } from './quiz/FeedbackPanel';
import { QuizPanel } from './quiz/QuizPanel';
import './GameScreen.css';

// 3D 장면(three.js·R3F)은 게임을 시작할 때 따로 불러온다(첫 화면을 가볍게).
const GameCanvas = lazy(() => import('../scene/GameCanvas').then((m) => ({ default: m.GameCanvas })));

/** 3D 장면에서 오류가 나면 간소화 학습 모드로 바꿔 학습을 이어 간다. */
class StageBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('3D 장면 오류: 간소화 학습 모드로 전환합니다.', error, info.componentStack);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function StageLoading() {
  return (
    <div className="stage-loading" role="status">
      <span className="stage-loading-dot" aria-hidden="true" />
      3D 탐험 공간을 준비하는 중…
    </div>
  );
}

export function GameScreen() {
  const hasGame = useApp((s) => s.game !== null);
  const phase = useApp((s) => s.game?.phase);
  const dialogueKind = useApp((s) => s.game?.dialogue?.kind ?? null);
  const stepIndex = useApp((s) => s.game?.stepIndex ?? 0);
  const simplified = useApp((s) => s.simplified);
  const quizCollapsed = useApp((s) => s.quizCollapsed);
  const setSimplified = useApp((s) => s.setSimplified);
  const setDialogueCollapsed = useApp((s) => s.setDialogueCollapsed);
  // 일시정지 메뉴가 보이는 동안 뒤쪽 화면은 조작할 수 없게(inert) 한다.
  const pauseVisible = useApp((s) => s.paused && !s.mapOpen && !s.settingsOpen && !s.reportOpen);

  useKeyboardControls();

  // 이동·관찰이 아닐 때는 조향 입력을 풀어 둔다.
  useEffect(() => {
    if (phase !== 'travel' && phase !== 'observe') runtime.steerInput = 0;
  }, [phase]);
  useEffect(
    () => () => {
      runtime.steerInput = 0;
    },
    [],
  );

  // 새 대화가 시작되면 접어 둔 대화 상자를 다시 펼친다(새 대사를 놓치지 않게).
  useEffect(() => {
    if (dialogueKind) setDialogueCollapsed(false);
  }, [dialogueKind, stepIndex, setDialogueCollapsed]);

  if (!hasGame) return null;

  return (
    <div className={`game-screen phase-${phase ?? 'none'}${quizCollapsed ? ' is-quiz-collapsed' : ''}`}>
      <div className="game-main" inert={pauseVisible}>
        <div className="game-stage">
          {simplified ? (
            <SimplifiedStage />
          ) : (
            <StageBoundary onError={() => setSimplified(true)}>
              <Suspense fallback={<StageLoading />}>
                <GameCanvas />
              </Suspense>
            </StageBoundary>
          )}
        </div>

        <div className="game-overlay">
          <div className="ov-region ov-top-right">
            <HudActions />
          </div>
          <div className="ov-region ov-left">
            <HudInfo />
            <ClueTray />
          </div>
          <div className="ov-region ov-top-center">
            <ClueCard />
          </div>
          <div className="ov-region ov-right">
            <QuizPanel />
            <FeedbackPanel />
          </div>
          <div className="ov-region ov-bottom">
            <TravelBar />
            <DialogueBox />
          </div>
          <SteerControls />
        </div>
      </div>

      <ActivityPanel />
      <RecheckPanel />
      <EscapeScreen />
      <MapPanel />
      <PauseMenu />
    </div>
  );
}
