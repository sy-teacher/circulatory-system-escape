// WebGL 2를 쓸 수 없는 기기·브라우저 안내.
// 간소화 학습 모드는 같은 문제·같은 결과 보고서로 학습할 수 있게 해 주지만, 3D 탐험을 대신하지는 않는다.

import { useId } from 'react';
import './Fallback.css';

export interface WebGLNoticeProps {
  /** '간소화 학습 모드로 시작' 버튼(없으면 버튼을 그리지 않는다) */
  onStartSimplified?: () => void;
  /** 이어서 할 기록이 있을 때 '간소화 학습 모드로 이어서 하기' */
  onResumeSimplified?: () => void;
  className?: string;
}

export function WebGLNotice({ onStartSimplified, onResumeSimplified, className }: WebGLNoticeProps) {
  const id = useId();
  return (
    <section className={['webgl-notice', className].filter(Boolean).join(' ')} role="region" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="webgl-notice-title">
        <span aria-hidden="true">⚠️</span> 이 기기에서는 3D 탐험을 실행할 수 없어요
      </h2>
      <p>
        지금 쓰는 브라우저(또는 기기)가 <strong>WebGL 2</strong>를 지원하지 않거나 꺼져 있어요. 다음 방법을 시도해 보세요.
      </p>
      <ul className="webgl-notice-tips">
        <li>크롬(Chrome)을 최신 버전으로 업데이트한 뒤 다시 열어 보세요.</li>
        <li>
          크롬 설정 → 시스템에서 <strong>‘가능한 경우 그래픽 가속 사용’</strong>(하드웨어 가속)을 켜고 브라우저를 다시 시작해 보세요.
        </li>
        <li>그래도 안 되면 다른 기기나 다른 브라우저로 열어 보세요.</li>
      </ul>
      <p className="webgl-notice-alt">
        대신 <strong>간소화 학습 모드</strong>로 같은 문제를 풀고 같은 결과 보고서를 받을 수 있어요. 3D 공간 대신 그림과 글로 보여 주기 때문에,{' '}
        <strong>3D 탐험을 대신하는 것은 아니에요.</strong> 가능하면 3D가 되는 기기에서 다시 탐험해 보세요.
      </p>
      {(onStartSimplified || onResumeSimplified) && (
        <div className="webgl-notice-actions">
          {onResumeSimplified && (
            <button type="button" className="btn btn-secondary" onClick={onResumeSimplified}>
              간소화 학습 모드로 이어서 하기
            </button>
          )}
          {onStartSimplified && (
            <button type="button" className={onResumeSimplified ? 'btn' : 'btn btn-secondary'} onClick={onStartSimplified}>
              간소화 학습 모드로 시작
            </button>
          )}
        </div>
      )}
    </section>
  );
}
