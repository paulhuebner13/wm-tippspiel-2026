'use client';

import { toggleResultSubmitterAction } from '@/app/actions';

export function ResultPermissionForm({
  profileId,
  enabled,
}: {
  profileId: string;
  enabled: boolean;
}) {
  return (
    <form action={toggleResultSubmitterAction} className="resultPermissionForm">
      <input type="hidden" name="profileId" value={profileId} />
      <label className="resultPermissionCheck" title="Resultate und Simulation">
        <input
          name="canSubmitResults"
          type="checkbox"
          defaultChecked={enabled}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        />
        <span aria-hidden="true">✓</span>
      </label>
    </form>
  );
}
