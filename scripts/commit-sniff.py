from dataclasses import dataclass
from pathlib import Path
import subprocess
import datetime as dt

REPOSITORY_ROOTS = [
    "/home/gabe/WSL-Repos",
    "/mnt/c/Users/GabrieleCalvo/Projects/Repos/",
]
AUTHOR = "Calvo"
LOOKBACK_DAYS = 21


@dataclass
class CommitInfo:
    message: str
    date: str
    repo: str
    author: str

    def to_line(self) -> str:
        return f"{self.date} | {self.repo[:30]:<30} | {self.message}"

def get_all_commit_by_author(repo_path: Path, date_since: dt.date, author: str = AUTHOR) -> list[CommitInfo]:
    since_date = date_since.strftime("%Y-%m-%d")
    cmd = [
        "git",
        "-C",
        repo_path.as_posix(),
        "log",
        f"--since={since_date}",
        f"--author={author}",
        "--pretty=format:%H|%an|%ad|%s",
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except Exception as e:
        print(f"Error running git log in {repo_path}: {e}")
        return []

    if result.returncode != 0:
        print(f"Error running git log in {repo_path}: {result.stderr}")
        return []

    commits = []
    for line in result.stdout.splitlines():
        parts = line.split("|")
        if len(parts) == 4:
            commits.append(
                CommitInfo(
                    message=parts[3],
                    date=dt.datetime.strptime(parts[2], "%a %b %d %H:%M:%S %Y %z").strftime("%Y-%m-%d %H:%M"),
                    repo=repo_path.stem,  # Get the repository name from the path
                    author=parts[1],
                )
            )

    return commits


def get_all_repo_directories_recursively(root_dirs: list[str]) -> list[Path]:
    repo_dirs = []
    for root in root_dirs:
        for repo in subprocess.run(
            ["find", root, "-type", "d", "-name", ".git"], stdout=subprocess.PIPE, text=True
        ).stdout.splitlines():
            repo_dirs.append(Path(repo[:-5]))  # Remove the trailing '.git' and convert to Path
    return repo_dirs


if __name__ == "__main__":
    cutoff_date = dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS)
    all_commits = []

    repo_dirs = get_all_repo_directories_recursively(REPOSITORY_ROOTS)

    for repo_path in repo_dirs:
        commits = get_all_commit_by_author(repo_path, cutoff_date)
        all_commits.extend(commits)

    for commit in sorted(all_commits, key=lambda c: c.date):
        print(commit.to_line())
