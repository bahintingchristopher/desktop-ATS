# Desktop ATS Workspace — Fresh Installation Settings Guide

## 1. First launch: create the local account

On a new laptop, the app opens the **login** screen.

1. Click **Create account**.
2. Enter the HR user's **email address**.
3. Enter a **password** of at least 8 characters.
4. Re-enter it under **Confirm password**.
5. Click **Create account**.

After the account is created, the app automatically opens **Settings**.

## 2. Required Settings fields

Go to **Settings → Email account**.

| Field | What to enter | Required? |
|---|---|---|
| **Your email address** | HR's real email address, for example `hr@gmail.com` | Yes |
| **App password** | The 16-character app password from the email provider | Yes |
| **Display name** | The name applicants should see | Recommended |
| **Send-as email (From)** | HR's own email address, or leave blank | Optional |
| **Email signature** | Signature added to sent emails | Optional |

**Send-as email (From)** defaults to **Your email address** if left blank. Applicants see this address, and replies go there.

Do not use another person's email address on HR's laptop.

## 3. Gmail and ALMA server settings

For Gmail (`@gmail.com`) and ALMA Google Workspace (`@almallc.net`), HR does **not** need to type server settings. The app auto-detects them:

- **IMAP host:** `imap.gmail.com`
- **IMAP port:** `993`
- **SMTP host:** `smtp.gmail.com`
- **SMTP port:** `465`

If **Show server settings** is open and those values appear, that is correct. If an old wrong value appears, clear the field and save again.

For Outlook/Hotmail or Yahoo, the app also auto-detects the usual settings. For other company mailboxes, ask IT for the correct IMAP/SMTP host and ports.

## 4. How to get a Gmail app password

A normal Gmail password will **not** work.

1. Go to `myaccount.google.com/security`.
2. Sign in to the exact mailbox that will be entered in Settings, for example `christopher.bahinting@almallc.net`.
3. Turn on **2-Step Verification** if it is off.
4. Go to `myaccount.google.com/apppasswords`.
5. Create an app password named **Desktop ATS**.
6. Copy the 16-character code.
7. Paste it into Settings → **App password**.

Google may show the code with spaces, for example `abcd efgh ijkl mnop`. That is fine.

An app password from a personal Gmail account will **not** work for `almallc.net`. It must be created while signed in to that exact `almallc.net` account.

## 5. Save and test

After filling the required fields:

1. Click **Save & test connection**.
2. Wait for the result.
3. Success message: **"Connected! The app can now receive and send email."**

Only after that should HR use **Mail**, **Applicants**, and the other pages.

## 6. Optional Settings

These can usually stay as default:

- **Applicant data folder:** leave blank to use `Documents\MyATS_Data`.
- **Whisper model file:** keep the recommended `large-v3`.
- **Interview language:** choose Tagalog/Taglish or English.
- **Transcription install:** the needed tools download automatically on first use, or click **Install now**.

## 7. Common errors

**"Application-specific password required"**  
HR used the normal email password. Create and paste an app password for the exact mailbox entered in Settings.

**"Invalid credentials" / "Login failed"**  
Re-copy the app password and check the email address spelling.

**"Can't reach the email server"**  
Check internet connection. For Gmail and ALMA, confirm the hosts are `imap.gmail.com` and `smtp.gmail.com`. Do not use `imap.almallc.net`; ALMA uses Gmail/Google Workspace servers.

**No emails showing**  
Open **Mail** and click **Sync**, then confirm Settings shows "Connected."

## 8. Security note

No email address, app password, or database from the developer laptop is included in the installer. Each new laptop stores its own settings locally after HR enters them.

## 9. Logging out

Use the **Logout** button at the bottom of the left sidebar to return to the login screen. Another HR user can then sign in with their own local account.
