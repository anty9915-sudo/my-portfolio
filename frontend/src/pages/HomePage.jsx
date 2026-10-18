import { useApi } from '../hooks/useApi.js'
import { AboutSection } from '../sections/AboutSection.jsx'
import { ContactSection } from '../sections/ContactSection.jsx'
import { HeroSection } from '../sections/HeroSection.jsx'
import { ProjectsSection } from '../sections/ProjectsSection.jsx'
import { SkillsSection } from '../sections/SkillsSection.jsx'
import { StudySection } from '../sections/StudySection.jsx'
import { api } from '../services/api.js'

export function HomePage() {
  // 기술 목록은 소개(학습 중)·기술 스택·프로젝트 필터가 함께 쓴다
  const skillsQuery = useApi((signal) => api.skills(undefined, { signal }), [])

  return (
    <>
      <HeroSection />
      <AboutSection skillsQuery={skillsQuery} />
      <SkillsSection skillsQuery={skillsQuery} />
      <ProjectsSection skillsQuery={skillsQuery} />
      <StudySection />
      <ContactSection />
    </>
  )
}
