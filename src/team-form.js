import { escapeHtml as esc } from './event-model.js';
import './team-form.css';

export function enhanceTeamForm({form, profile, user, event, client}) {
  const panel = form.querySelector('.event-panel');
  panel.innerHTML = '<h2>Your student details</h2><p>Filled from your account. You can correct your details here before you RSVP. Corrections also update your student profile.</p><p class="form-note">* Required field. Contact email is for this RSVP; your sign-in email stays the same.</p><div class="form-grid" data-student-fields></div>';
  const fields = panel.querySelector('[data-student-fields]');
  const definitions = [ ['full_name','Full name',2,100], ['college','College / university',2,160], ['usn','Student ID / USN',3,30], ['department','Department',1,80] ];
  for (const [name,label,min,max] of definitions) {
    fields.insertAdjacentHTML('beforeend', `<label>${label} <span class="required-mark">*</span><input name="student_${name}" value="${esc(profile[name] || '')}" required minlength="${min}" maxlength="${max}" autocomplete="${name==='full_name'?'name':name==='college'?'organization':'off'}"></label>`);
  }
  fields.insertAdjacentHTML('beforeend', `<label>Year <span class="required-mark">*</span><select name="student_year" required>${[1,2,3,4].map(year=>`<option value="${year}" ${Number(profile.year)===year?'selected':''}>Year ${year}</option>`).join('')}</select></label>`);
  const email = form.elements.q_contact_email;
  email.type = 'email'; email.value = user.email || ''; email.maxLength = 254;
  fields.append(email.closest('label'));
  if (form.elements.q_linkedin) form.elements.q_linkedin.value = profile.linkedin || '';
  if (form.elements.q_github) form.elements.q_github.value = profile.github || '';

  const team = form.querySelector('[data-team]');
  const slots = [...team.querySelectorAll('.form-grid')];
  slots.forEach((slot, index) => {
    slot.hidden = index > 0;
    slot.dataset.teammate = String(index);
    slot.querySelectorAll('input').forEach(input => {input.disabled = true;});
  });
  const leader = document.createElement('label');
  leader.innerHTML = 'Are you the team leader? <span class="required-mark">*</span><select name="is_leader" required><option value="">Choose an option</option><option value="yes">Yes, I’m creating and leading this team</option><option value="no">No, I’m joining a team</option></select>';
  team.prepend(leader);
  const sidebar = document.createElement('aside');
  sidebar.className = 'team-progress';
  sidebar.innerHTML = '<strong data-member-count aria-live="polite"></strong><span>members planned</span><progress aria-label="Planned team members"></progress><p>You count as member 1. Added teammates are invitations; they must sign in and join with your code to confirm their places.</p>';
  team.prepend(sidebar);
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'add-teammate'; add.textContent = '+ Add teammate';
  team.append(add);
  const markRequired = () => form.querySelectorAll('input,select,textarea').forEach(input => {
    const label = input.closest('label');
    if (!label) return;
    let mark = label.querySelector('.required-mark');
    if (input.required && !mark) {mark=document.createElement('span'); mark.className='required-mark'; mark.textContent=' *'; label.prepend(mark);}
    if (mark) mark.hidden = !input.required || input.disabled;
  });
  const update = () => {
    const creating = form.elements.kind.value === 'team';
    leader.querySelector('select').disabled = !creating;
    let filled = 0;
    slots.forEach(slot => {
      const inputs = [...slot.querySelectorAll('input')];
      const active = creating && !slot.hidden;
      const started = inputs.some(input => input.value.trim());
      inputs.forEach(input => {input.disabled = !active; input.required = active && started;});
      if (active && inputs.every(input=>input.value.trim())) filled++;
    });
    sidebar.querySelector('[data-member-count]').textContent = `${1+filled}/${event.max_team}`;
    const progress=sidebar.querySelector('progress'); progress.max=event.max_team; progress.value=1+filled;
    add.disabled = slots.every(slot=>!slot.hidden);
    add.hidden = slots.length === 0;
    form.elements.team_name.disabled = !creating;
    form.elements.join_code.disabled = form.elements.kind.value !== 'join';
    markRequired();
  };
  add.onclick = () => {
    const next=slots.find(slot=>slot.hidden);
    if (next) {next.hidden=false; update(); next.querySelector('input').focus();}
  };
  form.elements.is_leader.onchange = () => {
    if (form.elements.is_leader.value === 'no') {
      form.elements.kind.value='join'; form.elements.kind.dispatchEvent(new Event('change'));
      form.elements.join_code.focus();
    }
  };
  form.elements.kind.addEventListener('change', update);
  team.addEventListener('input', update);
  update();

  const submit = form.onsubmit;
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const button=form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled=true;
    try {
      const changes=Object.fromEntries(definitions.map(([name])=>[name,form.elements['student_'+name].value.trim()]));
      changes.usn=changes.usn.toUpperCase();
      changes.year=Number(form.elements.student_year.value);
      if (Object.entries(changes).some(([key,value])=>value!==profile[key])) {
        const {data,error}=await client.from('profiles').update(changes).eq('id',user.id).select('id').single();
        if (error || !data) throw error || Error('Your profile could not be saved. Please try again.');
        Object.assign(profile,changes);
      }
      await submit(ev);
    } catch(error) {
      form.querySelector('#registration-message').textContent=error.message;
    } finally {button.disabled=false;}
  };
}
